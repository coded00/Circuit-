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
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getDefaultPaymentProvider } from "@/lib/payments";
import { AgeGateError, assertAgeGate } from "@/lib/age-gate";

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

  const existingPayout = await prisma.escrowTransaction.findFirst({
    where: { tournamentId: id, type: "PRIZE_PAYOUT" },
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
  const transfer = await provider.initiateTransfer({
    amount: tournament.prizeAmount,
    currency: "NGN",
    destinationRef: user.payoutMethodRef,
    reference,
    reason: `Prize payout — ${tournament.name}`,
  });

  await prisma.escrowTransaction.create({
    data: {
      tournamentId: tournament.id,
      type: "PRIZE_PAYOUT",
      amount: tournament.prizeAmount,
      provider: provider.name,
      providerRef: transfer.providerReference,
      status: transfer.status === "SUCCESS" ? "COMPLETE" : "PENDING",
    },
  });

  return NextResponse.json({ status: transfer.status });
}
