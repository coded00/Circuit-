/**
 * Circuit — Withdraw from Wallet: real money out, via the same
 * `provider.initiateTransfer` call the prize-payout route already uses
 * (src/app/api/tournaments/[id]/payout/route.ts). The balance check and
 * debit are one atomic conditional UPDATE inside the same DB transaction
 * as the ledger row — two concurrent withdrawal requests can't both pass
 * the balance check and overdraw the account.
 *
 * If the transfer itself fails after the debit, the debit is reversed
 * (credited back) in the same request — the balance was only ever
 * reserved against a transfer that's about to be attempted, not spent
 * until the provider actually confirms it left. A transfer left PENDING
 * (bank transfers aren't always instant) still counts as "gone" — same
 * as the payout route's own status handling.
 */

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getDefaultPaymentProvider } from "@/lib/payments";
import { AgeGateError, assertAgeGate } from "@/lib/age-gate";
import { trackEvent } from "@/lib/analytics";
import { captureException, captureMessage } from "@/lib/observability";

const MIN_WITHDRAW_AMOUNT = 10000; // ₦100

class InsufficientWalletBalanceError extends Error {}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (user.isSuspended) {
    return NextResponse.json(
      { error: `Your account is suspended: ${user.suspensionReason ?? "contact support."}` },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const amount = typeof body?.amount === "number" ? Math.round(body.amount) : NaN;
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAW_AMOUNT) {
    return NextResponse.json(
      { error: `Minimum withdrawal amount is ₦${(MIN_WITHDRAW_AMOUNT / 100).toLocaleString("en-NG")}.` },
      { status: 400 }
    );
  }

  try {
    assertAgeGate(user.dateOfBirth);
  } catch (err) {
    if (err instanceof AgeGateError) {
      return NextResponse.json(
        {
          error:
            err.code === "MISSING_DOB"
              ? "Add your date of birth in your account settings before withdrawing."
              : err.message,
        },
        { status: 403 }
      );
    }
    throw err;
  }

  if (!user.payoutMethodRef) {
    return NextResponse.json(
      { error: "Link a payout method in your account settings before withdrawing." },
      { status: 400 }
    );
  }

  const reference = `wallet_withdraw_${randomUUID().slice(0, 12)}`;
  const provider = getDefaultPaymentProvider();

  let txnId: string;
  try {
    txnId = await prisma.$transaction(async (tx) => {
      const debited = await tx.user.updateMany({
        where: { id: user.id, walletBalance: { gte: amount } },
        data: { walletBalance: { decrement: amount } },
      });
      if (debited.count === 0) throw new InsufficientWalletBalanceError();

      const txn = await tx.walletTransaction.create({
        data: {
          userId: user.id,
          type: "WITHDRAWAL",
          amount,
          provider: provider.name,
          providerRef: reference,
          status: "PENDING",
        },
      });
      return txn.id;
    });
  } catch (err) {
    if (err instanceof InsufficientWalletBalanceError) {
      return NextResponse.json({ error: "Insufficient wallet balance." }, { status: 402 });
    }
    throw err;
  }

  try {
    const transfer = await provider.initiateTransfer({
      amount,
      currency: "NGN",
      destinationRef: user.payoutMethodRef,
      reference,
      reason: "Circuit wallet withdrawal",
    });

    await prisma.walletTransaction.update({
      where: { id: txnId },
      data: { status: transfer.status === "SUCCESS" ? "COMPLETE" : transfer.status === "FAILED" ? "FAILED" : "PENDING" },
    });

    if (transfer.status === "FAILED") {
      // Nothing actually left the platform — give the balance back.
      await prisma.user.update({ where: { id: user.id }, data: { walletBalance: { increment: amount } } });
      captureMessage("Wallet withdrawal reported FAILED by provider", "warning", {
        userId: user.id,
        walletTransactionId: txnId,
        amount,
        provider: provider.name,
      });
      return NextResponse.json({ error: "Withdrawal failed. Your balance has been restored." }, { status: 502 });
    }

    trackEvent("wallet_withdrawn", { userId: user.id, amountMinor: amount, currency: "NGN" });

    return NextResponse.json({ status: transfer.status });
  } catch (err) {
    // The transfer call itself threw (network/provider error, not a
    // reported FAILED status) — same restoration, nothing left custody.
    // V1 audit follow-up: this used to only console-log via the
    // uncaught throw below — a real production transfer failure here
    // (a Paystack/Flutterwave outage mid-withdrawal) was invisible to
    // any error-monitoring dashboard.
    captureException(err, { route: "wallet/withdraw", userId: user.id, walletTransactionId: txnId, amount, provider: provider.name });
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { walletBalance: { increment: amount } } }),
      prisma.walletTransaction.update({ where: { id: txnId }, data: { status: "FAILED" } }),
    ]);
    throw err;
  }
}
