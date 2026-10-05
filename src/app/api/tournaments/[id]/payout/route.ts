/**
 * Circuit — prize payout release (Build Plan P2-6, maps: REG-6).
 *
 * "The final match clears its dispute window" (REG-6) is already implied
 * by Tournament.status === COMPLETE: that flip only ever happens inside
 * completeMatch() for the bracket's last round, which is only reached
 * once any dispute on that match resolved. No separate window-tracking
 * needed here — see src/lib/matches.ts's applyWinnerAdvancement.
 */

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { Prisma, EscrowStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { tournamentPrizeShares } from "@/lib/prizePlaces";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { getDefaultPaymentProvider } from "@/lib/payments";
import { AgeGateError, assertAgeGate } from "@/lib/age-gate";
import { trackEvent } from "@/lib/analytics";
import { applyTransferOutcome } from "@/lib/payments/transfers";
import { captureException, captureMessage } from "@/lib/observability";
import { emailVerificationRequired } from "@/lib/emailGate";
import { payableFraction, releaseDelayHours } from "@/lib/prizePool";
import { isDefiniteRejection } from "@/lib/payments/errors";
import { hasSettledFunds } from "@/lib/payments/balance";
import { logAdminAction } from "@/lib/auditLog";

// A row still PENDING or already COMPLETE means this prize is spoken for;
// a FAILED row (the transfer call itself errored, or the provider reported
// a failure) doesn't block a fresh claim attempt.
const CLAIMED_STATUSES: EscrowStatus[] = ["PENDING", "COMPLETE"];

// Same isolation + retry pattern as applyWinnerAdvancement in
// src/lib/matches.ts, for the same reason: this "check nothing exists yet,
// then create" needs to be atomic against a second concurrent request, not
// just fast — a plain read-then-write here previously let two concurrent
// claims from the legitimate champion both pass the check, both call
// Paystack, and both succeed, i.e. a real double payout of prize money.
const PAYOUT_CLAIM_MAX_RETRIES = 3;

class AlreadyClaimedError extends Error {}
class FundsFrozenError extends Error {}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;

  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }
  if (tournament.status !== "COMPLETE") {
    return NextResponse.json({ error: "This tournament isn't complete yet." }, { status: 409 });
  }
  if (tournament.fundsFrozen) {
    return NextResponse.json({ error: "Funds for this tournament are frozen pending review." }, { status: 409 });
  }
  // Staff review the results and the money collected before any prize is released.
  if (!tournament.payoutApprovedAt) {
    return NextResponse.json(
      { error: "Prizes are released after Circuit staff review the results and the money collected. Check back soon." },
      { status: 409 }
    );
  }
  // Nothing moves until the tournament is over and the settlement wait (T+1, same as Paystack) has passed.
  const delayHours = await releaseDelayHours();
  const releaseAt = tournament.completedAt ? new Date(tournament.completedAt.getTime() + delayHours * 60 * 60 * 1000) : null;
  if (!releaseAt || releaseAt > new Date()) {
    return NextResponse.json(
      { error: `Prizes are released ${delayHours} hours after a tournament ends${releaseAt ? ` (from ${releaseAt.toUTCString()})` : ""}.` },
      { status: 409 }
    );
  }
  if (!tournament.prizeAmount || tournament.prizeAmount <= 0) {
    return NextResponse.json({ error: "This tournament has no cash prize to claim." }, { status: 409 });
  }

  // Each paid place claims its own share (src/lib/prizes.ts): the whole
  // prize for the champion when it's winner-takes-all.
  const shares = await tournamentPrizeShares(tournament);
  if (shares.length === 0) {
    return NextResponse.json({ error: "No champion has been decided yet." }, { status: 409 });
  }
  const share = shares.find((s) => s.userId === user.id);
  if (!share) {
    return NextResponse.json(
      { error: shares.length === 1 ? "Only the tournament champion can claim this prize." : "Only players who finished in a prize place can claim." },
      { status: 403 }
    );
  }
  // Payouts from before split prizes have no userId — they were always the champion's.
  const mineOrLegacy = { OR: [{ userId: user.id }, { userId: null }] };

  // Fast-path check only — not the actual guard against a concurrent
  // double-claim (that's the transaction below). This just avoids running
  // the age-gate/payout-method checks below for the common case.
  const existingPayout = await prisma.escrowTransaction.findFirst({
    where: { tournamentId: id, type: "PRIZE_PAYOUT", status: { in: CLAIMED_STATUSES }, ...mineOrLegacy },
  });
  if (existingPayout) {
    return NextResponse.json({ error: "You've already claimed your prize." }, { status: 409 });
  }

  // ACC-3: payout claim is a cash-touching action.
  const unverified = emailVerificationRequired(user);
  if (unverified) return unverified;
  try {
    assertAgeGate(user.dateOfBirth);
  } catch (err) {
    if (err instanceof AgeGateError) {
      return NextResponse.json(
        {
          error:
            err.code === "MISSING_DOB"
              ? "Add your date of birth in your account settings before claiming a prize."
              : err.message,
        },
        { status: 403 }
      );
    }
    throw err;
  }

  if (!user.payoutMethodRef) {
    return NextResponse.json(
      { error: "Link a payout method in your account settings before claiming this prize." },
      { status: 400 }
    );
  }

  const provider = getDefaultPaymentProvider();
  // Unique per attempt: a retry after a failed transfer needs a fresh
  // reference (Paystack rejects a reused one, and providerRef is unique).
  // Stored on the row up front so the transfer webhook can always find it.
  const reference = `payout_${randomUUID()}`;
  // A prize is paid out of the entry fees actually collected, never more.
  const fraction = await payableFraction(tournament);
  const prizeAmount = Math.floor(share.amount * fraction);
  if (prizeAmount <= 0) {
    return NextResponse.json({ error: "No entry fees were collected for this tournament, so there is no prize to pay out." }, { status: 409 });
  }
  // Is there settled money to send? If not (Paystack settles T+1), decline now: nothing is reserved, so the winner just claims again later.
  const funds = await hasSettledFunds(provider, prizeAmount);
  if (!funds.ok) {
    return NextResponse.json(
      { error: "Payouts are briefly delayed while the entry fees finish settling. Your prize is safe. Please try again in a few hours." },
      { status: 503, headers: { "Retry-After": "3600" } }
    );
  }

  // Reserve the claim — a PENDING row created inside a Serializable
  // transaction that re-checks for an existing claim first. Two concurrent
  // requests can't both pass this: Postgres forces one to retry, and the
  // retry sees the row the other one committed.
  //
  // The fundsFrozen check above is a plain read, taken before this
  // transaction starts — a real gap, not just a formality: staff freezing
  // funds in that window (or between this reservation committing and the
  // transfer call below) previously let an in-flight claim go through
  // anyway, defeating the freeze's whole point as an emergency halt. This
  // transaction re-reads fundsFrozen fresh (Serializable isolation means
  // a concurrent freeze write forces this transaction to see it or to
  // retry against it, not silently miss it), and there's a second check
  // right before initiateTransfer for the narrower gap after this
  // transaction commits but before the actual transfer call goes out.
  let txnId: string;
  for (let attempt = 0; ; attempt++) {
    try {
      txnId = await prisma.$transaction(
        async (tx) => {
          const freshTournament = await tx.tournament.findUniqueOrThrow({ where: { id }, select: { fundsFrozen: true } });
          if (freshTournament.fundsFrozen) throw new FundsFrozenError();

          const existing = await tx.escrowTransaction.findFirst({
            where: { tournamentId: id, type: "PRIZE_PAYOUT", status: { in: CLAIMED_STATUSES }, ...mineOrLegacy },
          });
          if (existing) throw new AlreadyClaimedError();

          const row = await tx.escrowTransaction.create({
            data: { tournamentId: tournament.id, type: "PRIZE_PAYOUT", amount: prizeAmount, userId: user.id, place: share.place, provider: provider.name, providerRef: reference, status: "PENDING" },
          });
          return row.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      break;
    } catch (err) {
      if (err instanceof AlreadyClaimedError) {
        return NextResponse.json({ error: "You've already claimed your prize." }, { status: 409 });
      }
      if (err instanceof FundsFrozenError) {
        return NextResponse.json({ error: "Funds for this tournament are frozen pending review." }, { status: 409 });
      }
      const isSerializationFailure = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (isSerializationFailure && attempt < PAYOUT_CLAIM_MAX_RETRIES - 1) continue;
      throw err;
    }
  }

  // Narrower second window: fundsFrozen could still flip true in the gap
  // between the reservation above committing and this network call —
  // check once more before actually moving money. A frozen reservation is
  // marked FAILED (not left PENDING forever), which doesn't block a real
  // future claim attempt once unfrozen.
  const stillFrozen = await prisma.tournament.findUniqueOrThrow({ where: { id }, select: { fundsFrozen: true } });
  if (stillFrozen.fundsFrozen) {
    await prisma.escrowTransaction.update({ where: { id: txnId }, data: { status: "FAILED" } });
    return NextResponse.json({ error: "Funds for this tournament are frozen pending review." }, { status: 409 });
  }

  // A permanent record that this claim was made, before any money is sent (the escrow row alone can change status).
  await logAdminAction({
    actorId: user.id,
    action: "payout.prizeClaim",
    targetType: "Tournament",
    targetId: tournament.id,
    metadata: { amount: prizeAmount, declared: share.amount, place: share.place, reference, escrowTransactionId: txnId },
  }).catch((err) => captureException(err, { source: "payout:audit", tournamentId: tournament.id }));

  try {
    const transfer = await provider.initiateTransfer({
      amount: prizeAmount,
      currency: "NGN",
      destinationRef: user.payoutMethodRef,
      reference,
      reason: `Prize payout, ${tournament.name}`,
    });

    // PENDING waits for the transfer webhook (src/lib/payments/transfers.ts).
    if (transfer.status !== "PENDING") await applyTransferOutcome(reference, transfer.status);

    if (transfer.status === "SUCCESS") {
      trackEvent("escrow_payout_released", {
        userId: user.id,
        tournamentId: tournament.id,
        amountMinor: prizeAmount,
        currency: "NGN",
      });
    } else if (transfer.status === "FAILED") {
      captureMessage("Prize payout reported FAILED by provider", "warning", {
        userId: user.id,
        tournamentId: tournament.id,
        escrowTransactionId: txnId,
        amount: prizeAmount,
        provider: provider.name,
      });
    }

    return NextResponse.json({ status: transfer.status });
  } catch (err) {
    // The transfer call itself threw (network/provider error, not a
    // reported FAILED status) — nothing confirmed to have left custody.
    // Mark FAILED rather than leaving the reservation stuck PENDING
    // forever; a FAILED row doesn't block the champion trying again.
    // V1 audit follow-up: previously only surfaced via the uncaught
    // throw below (a generic framework 500 log, no monitoring context) —
    // a real Paystack/Flutterwave outage mid-payout was invisible.
    captureException(err, { route: "tournaments/[id]/payout", userId: user.id, tournamentId: tournament.id, escrowTransactionId: txnId, amount: prizeAmount, provider: provider.name });
    if (!isDefiniteRejection(err)) {
      // A timeout or dropped connection: Paystack may have accepted the transfer. Marking it failed would let
      // the winner claim again and be paid twice, so the claim stays reserved (PENDING) and the sweep asks
      // Paystack what happened to this reference, then settles it either way.
      return NextResponse.json(
        { status: "PENDING", message: "Your prize is being processed. We'll confirm it shortly. Don't claim again." },
        { status: 202 }
      );
    }
    await prisma.escrowTransaction.updateMany({ where: { id: txnId, status: "PENDING" }, data: { status: "FAILED" } });
    return NextResponse.json(
      { error: "We couldn't send your prize right now. Nothing has been taken. Your prize is still yours to claim, so please try again later." },
      { status: 502 }
    );
  }
}
