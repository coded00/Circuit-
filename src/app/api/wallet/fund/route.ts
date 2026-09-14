/**
 * Circuit — Fund Wallet: real money in, via the same hosted-checkout
 * pattern as a tournament entry fee (src/app/api/tournaments/[id]/
 * registrations/route.ts). Creates a PENDING `WalletTransaction` and
 * hands back a checkout URL; the balance itself only ever increments
 * inside `confirmWalletFunding` (src/lib/payments/confirm.ts), once the
 * provider confirms the charge — same "never trust the redirect alone"
 * discipline as entry-fee payments.
 */

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getDefaultPaymentProvider, toCheckoutEmail } from "@/lib/payments";
import { AgeGateError, assertAgeGate } from "@/lib/age-gate";

const MIN_FUND_AMOUNT = 10000; // ₦100

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
  if (!Number.isFinite(amount) || amount < MIN_FUND_AMOUNT) {
    return NextResponse.json(
      { error: `Minimum funding amount is ₦${(MIN_FUND_AMOUNT / 100).toLocaleString("en-NG")}.` },
      { status: 400 }
    );
  }

  // Funding is a cash-touching action, same as a paid registration (ACC-3).
  try {
    assertAgeGate(user.dateOfBirth);
  } catch (err) {
    if (err instanceof AgeGateError) {
      return NextResponse.json(
        {
          error:
            err.code === "MISSING_DOB"
              ? "Add your date of birth in your account settings before funding your wallet."
              : err.message,
        },
        { status: 403 }
      );
    }
    throw err;
  }

  const reference = `wallet_fund_${randomUUID().slice(0, 12)}`;
  const provider = getDefaultPaymentProvider();

  const chargeResult = await provider.initializeCharge({
    amount,
    currency: "NGN",
    email: toCheckoutEmail(user.emailOrPhone, user.id),
    reference,
    callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/wallet/fund/callback?ref=${reference}`,
    metadata: { userId: user.id, purpose: "wallet_fund" },
  });

  await prisma.walletTransaction.create({
    data: {
      userId: user.id,
      type: "FUND",
      amount,
      provider: provider.name,
      providerRef: reference,
      status: "PENDING",
    },
  });

  return NextResponse.json({ authorizationUrl: chargeResult.authorizationUrl }, { status: 201 });
}
