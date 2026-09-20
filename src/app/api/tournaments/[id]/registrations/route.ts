/**
 * Circuit — registration (Build Plan P2-1/P2-2/P2-3, maps: REG-1, REG-2, REG-3).
 *
 * Free and paid tournaments fork here: a free entry confirms immediately
 * (there's no payment to wait on); a paid entry is created PENDING_PAYMENT
 * and handed a hosted-checkout URL — it only ever becomes CONFIRMED via
 * confirmEntryFeePayment (the webhook path), never directly in this route.
 *
 * A third path, `payFrom: "wallet"`, confirms immediately too — like the
 * free path, there's no external payment to wait on, since the money
 * already left the user's Circuit wallet balance in the same DB
 * transaction that confirms the registration (see src/lib/wallet.ts and
 * the WalletTransaction model for that ledger).
 *
 * REG-3's auto-close is enforced live here (deadline or cap) rather than
 * via a background sweep updating Tournament.status — see
 * docs/circuit-stack.md's Scheduled work section for why a periodic sweep
 * is still the right call once there's somewhere to run it (Vercel Cron);
 * until then, checking live at the write is equally correct, just without
 * the status field itself flipping to CLOSED in between.
 */

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getDefaultPaymentProvider, toCheckoutEmail } from "@/lib/payments";
import { maybeGenerateBracketOnCapFill } from "@/lib/matches";
import { AgeGateError, assertAgeGate } from "@/lib/age-gate";
import { computePlatformFee } from "@/lib/platformFee";

class InsufficientWalletBalanceError extends Error {}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in to register." },
      { status: 401 }
    );
  }
  if (user.isSuspended) {
    return NextResponse.json(
      { error: `Your account is suspended: ${user.suspensionReason ?? "contact support."}` },
      { status: 403 }
    );
  }

  const { id: tournamentId } = await params;
  const body = await request.json().catch(() => null);
  const inGameId = typeof body?.inGameId === "string" ? body.inGameId.trim() : "";
  if (!inGameId) {
    return NextResponse.json({ error: "In-game ID is required." }, { status: 400 });
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }

  const now = new Date();
  if (tournament.status === "CANCELLED") {
    return NextResponse.json({ error: "This tournament has been cancelled." }, { status: 409 });
  }
  if (now < tournament.registrationOpenAt) {
    return NextResponse.json({ error: "Registration hasn't opened yet." }, { status: 409 });
  }
  if (now >= tournament.registrationCloseAt) {
    return NextResponse.json({ error: "Registration is closed." }, { status: 409 });
  }

  // Known gap, accepted for V1: this count-then-write isn't inside a
  // serializable transaction, so two concurrent requests landing on the
  // last open slot could both pass this check. Not worth a row lock at
  // V1's expected concurrency (docs/circuit-stack.md's minimal-infra
  // stance) — revisit if a real tournament ever actually oversells its cap.
  const confirmedCount = await prisma.registration.count({
    where: { tournamentId, status: "CONFIRMED" },
  });
  if (confirmedCount >= tournament.participantCap) {
    return NextResponse.json({ error: "Registration is full." }, { status: 409 });
  }

  const existing = await prisma.registration.findUnique({
    where: { tournamentId_userId: { tournamentId, userId: user.id } },
  });
  // Only an active registration blocks a retry — WITHDRAWN/REFUNDED (a
  // prior withdrawal) and PENDING_PAYMENT (an abandoned checkout) both
  // reuse the same row instead.
  if (existing?.status === "CONFIRMED") {
    return NextResponse.json(
      { error: "You're already registered for this tournament." },
      { status: 409 }
    );
  }

  if (tournament.entryFee === 0) {
    const registration = existing
      ? await prisma.registration.update({
          where: { id: existing.id },
          data: { inGameId, status: "CONFIRMED" },
        })
      : await prisma.registration.create({
          data: { tournamentId, userId: user.id, inGameId, status: "CONFIRMED" },
        });
    await maybeGenerateBracketOnCapFill(tournamentId); // BRK-1's cap-fill path
    return NextResponse.json(
      { id: registration.id, status: registration.status },
      { status: 201 }
    );
  }

  // ACC-3: paid registration is a cash-touching action — age-gated, unlike
  // free registration or plain browsing (TRU-5).
  try {
    assertAgeGate(user.dateOfBirth);
  } catch (err) {
    if (err instanceof AgeGateError) {
      return NextResponse.json(
        {
          error:
            err.code === "MISSING_DOB"
              ? "Add your date of birth in your account settings before registering for a paid tournament."
              : err.message,
        },
        { status: 403 }
      );
    }
    throw err;
  }

  const payFromWallet = body?.payFrom === "wallet";

  if (payFromWallet) {
    const reference = `wallet_entry_${randomUUID().slice(0, 12)}`;
    const provider = getDefaultPaymentProvider();
    const platformSetting = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
    const feeAmount = computePlatformFee(tournament.entryFee, platformSetting?.platformFeeBps ?? 0);

    try {
      const registration = await prisma.$transaction(async (tx) => {
        // Atomic guard: a single conditional UPDATE, not a read-then-write —
        // two concurrent registration attempts can't both pass this check
        // and overdraw the balance.
        const debited = await tx.user.updateMany({
          where: { id: user.id, walletBalance: { gte: tournament.entryFee } },
          data: { walletBalance: { decrement: tournament.entryFee } },
        });
        if (debited.count === 0) throw new InsufficientWalletBalanceError();

        const reg = existing
          ? await tx.registration.update({
              where: { id: existing.id },
              data: { inGameId, status: "CONFIRMED", paymentRef: reference },
            })
          : await tx.registration.create({
              data: { tournamentId, userId: user.id, inGameId, status: "CONFIRMED", paymentRef: reference },
            });

        await tx.escrowTransaction.create({
          data: {
            tournamentId,
            registrationId: reg.id,
            type: "ENTRY_FEE",
            // `provider` here reflects Circuit's configured provider, not
            // that it was actually charged for this transaction — see
            // WalletTransactionType.ENTRY_FEE_DEBIT's own schema comment.
            provider: provider.name,
            amount: tournament.entryFee,
            providerRef: reference,
            status: "COMPLETE",
          },
        });
        // Same fee logic as confirmEntryFeePayment's own comment — carved
        // out of the entry fee that already arrived, not charged on top.
        if (feeAmount > 0) {
          await tx.escrowTransaction.create({
            data: { tournamentId, registrationId: reg.id, type: "PLATFORM_FEE", amount: feeAmount, status: "COMPLETE" },
          });
        }
        await tx.walletTransaction.create({
          data: {
            userId: user.id,
            type: "ENTRY_FEE_DEBIT",
            amount: tournament.entryFee,
            providerRef: reference,
            status: "COMPLETE",
          },
        });

        return reg;
      });

      await maybeGenerateBracketOnCapFill(tournamentId); // BRK-1's cap-fill path
      return NextResponse.json({ id: registration.id, status: "CONFIRMED" }, { status: 201 });
    } catch (err) {
      if (err instanceof InsufficientWalletBalanceError) {
        return NextResponse.json({ error: "Insufficient wallet balance." }, { status: 402 });
      }
      throw err;
    }
  }

  const registration = existing
    ? await prisma.registration.update({
        where: { id: existing.id },
        data: { inGameId, status: "PENDING_PAYMENT" },
      })
    : await prisma.registration.create({
        data: { tournamentId, userId: user.id, inGameId, status: "PENDING_PAYMENT" },
      });

  const reference = `reg_${registration.id}_${randomUUID().slice(0, 8)}`;
  const provider = getDefaultPaymentProvider();

  let chargeResult;
  try {
    chargeResult = await provider.initializeCharge({
      amount: tournament.entryFee,
      currency: "NGN",
      email: toCheckoutEmail(user.emailOrPhone, user.id),
      reference,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/tournaments/${tournamentId}/register/callback?ref=${reference}`,
      metadata: { tournamentId, userId: user.id },
    });
  } catch (err) {
    // Don't leave a fresh PENDING_PAYMENT row with no charge behind it —
    // only rolls back if we just created it (a reused row predates this
    // attempt and might still resolve from an earlier charge).
    if (!existing) {
      await prisma.registration.delete({ where: { id: registration.id } });
    }
    throw err;
  }

  await prisma.$transaction([
    prisma.registration.update({
      where: { id: registration.id },
      data: { paymentRef: reference },
    }),
    prisma.escrowTransaction.create({
      data: {
        tournamentId,
        registrationId: registration.id,
        type: "ENTRY_FEE",
        amount: tournament.entryFee,
        provider: provider.name,
        providerRef: reference,
        status: "PENDING",
      },
    }),
  ]);

  return NextResponse.json(
    {
      id: registration.id,
      status: "PENDING_PAYMENT",
      authorizationUrl: chargeResult.authorizationUrl,
    },
    { status: 201 }
  );
}
