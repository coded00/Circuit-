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
import { Prisma, EscrowStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getDefaultPaymentProvider } from "@/lib/payments";
import { AgeGateError, assertAgeGate } from "@/lib/age-gate";

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

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
  if (!tournament.prizeAmount || tournament.prizeAmount <= 0) {
    return NextResponse.json({ error: "This tournament has no cash prize to claim." }, { status: 409 });
  }

  const finalMatch = await prisma.match.findFirst({
    where: { tournamentId: id, round: { not: null } },
    orderBy: { round: "desc" },
  });
  if (!finalMatch?.winnerId) {
    return NextResponse.json({ error: "No champion has been decided yet." }, { status: 409 });
  }
  if (finalMatch.winnerId !== user.id) {
    return NextResponse.json({ error: "Only the tournament champion can claim this prize." }, { status: 403 });
  }

  // Fast-path check only — not the actual guard against a concurrent
  // double-claim (that's the transaction below). This just avoids running
  // the age-gate/payout-method checks below for the common case.
  const existingPayout = await prisma.escrowTransaction.findFirst({
    where: { tournamentId: id, type: "PRIZE_PAYOUT", status: { in: CLAIMED_STATUSES } },
  });
  if (existingPayout) {
    return NextResponse.json({ error: "This prize has already been claimed." }, { status: 409 });
  }

  // ACC-3: payout claim is a cash-touching action.
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
  const reference = `payout_${tournament.id}`;
  const prizeAmount = tournament.prizeAmount;

  // Reserve the claim — a PENDING row created inside a Serializable
  // transaction that re-checks for an existing claim first. Two concurrent
  // requests can't both pass this: Postgres forces one to retry, and the
  // retry sees the row the other one committed.
  let txnId: string;
  for (let attempt = 0; ; attempt++) {
    try {
      txnId = await prisma.$transaction(
        async (tx) => {
          const existing = await tx.escrowTransaction.findFirst({
            where: { tournamentId: id, type: "PRIZE_PAYOUT", status: { in: CLAIMED_STATUSES } },
          });
          if (existing) throw new AlreadyClaimedError();

          const row = await tx.escrowTransaction.create({
            data: { tournamentId: tournament.id, type: "PRIZE_PAYOUT", amount: prizeAmount, provider: provider.name, status: "PENDING" },
          });
          return row.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      break;
    } catch (err) {
      if (err instanceof AlreadyClaimedError) {
        return NextResponse.json({ error: "This prize has already been claimed." }, { status: 409 });
      }
      const isSerializationFailure = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (isSerializationFailure && attempt < PAYOUT_CLAIM_MAX_RETRIES - 1) continue;
      throw err;
    }
  }

  try {
    const transfer = await provider.initiateTransfer({
      amount: prizeAmount,
      currency: "NGN",
      destinationRef: user.payoutMethodRef,
      reference,
      reason: `Prize payout — ${tournament.name}`,
    });

    await prisma.escrowTransaction.update({
      where: { id: txnId },
      data: {
        providerRef: transfer.providerReference,
        status: transfer.status === "SUCCESS" ? "COMPLETE" : transfer.status === "FAILED" ? "FAILED" : "PENDING",
      },
    });

    return NextResponse.json({ status: transfer.status });
  } catch (err) {
    // The transfer call itself threw (network/provider error, not a
    // reported FAILED status) — nothing confirmed to have left custody.
    // Mark FAILED rather than leaving the reservation stuck PENDING
    // forever; a FAILED row doesn't block the champion trying again.
    await prisma.escrowTransaction.update({ where: { id: txnId }, data: { status: "FAILED" } });
    throw err;
  }
}
