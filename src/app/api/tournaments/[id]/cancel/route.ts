/**
 * Circuit — tournament cancellation & refund fan-out (Build Plan P2-5,
 * maps: REG-5, TRN-5).
 *
 * Refunds run sequentially, not in parallel — safer against a payment
 * provider's own rate limits than firing every refund at once, and V1 has
 * no job queue to retry a failed one later (docs/circuit-stack.md), so
 * each registrant's refund is isolated in its own try/catch: one failure
 * is reported back, not left to abort every registrant after it.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getPaymentProvider } from "@/lib/payments";

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
  if (tournament.organizerId !== user.id) {
    return NextResponse.json(
      { error: "Only the organizer can cancel this tournament." },
      { status: 403 }
    );
  }
  if (tournament.status === "CANCELLED") {
    return NextResponse.json({ error: "Already cancelled." }, { status: 409 });
  }
  if (new Date() >= tournament.startAt) {
    return NextResponse.json(
      { error: "Can't cancel after the tournament has started." },
      { status: 409 }
    );
  }

  const confirmedRegistrations = await prisma.registration.findMany({
    where: { tournamentId: id, status: "CONFIRMED" },
    include: { escrowTxns: true },
  });

  await prisma.tournament.update({ where: { id }, data: { status: "CANCELLED" } });

  const failedRefunds: string[] = [];
  let refundedCount = 0;

  for (const registration of confirmedRegistrations) {
    const paidEntryFeeTxn = registration.escrowTxns.find(
      (txn) => txn.type === "ENTRY_FEE" && txn.status === "COMPLETE"
    );
    if (!paidEntryFeeTxn) continue; // free registration — nothing to refund

    try {
      const provider = getPaymentProvider(paidEntryFeeTxn.provider);
      const refund = await provider.refundCharge(
        paidEntryFeeTxn.providerRef!,
        paidEntryFeeTxn.amount
      );

      await prisma.$transaction([
        prisma.registration.update({
          where: { id: registration.id },
          data: { status: "REFUNDED" },
        }),
        prisma.escrowTransaction.create({
          data: {
            tournamentId: id,
            registrationId: registration.id,
            type: "REFUND",
            amount: paidEntryFeeTxn.amount,
            provider: paidEntryFeeTxn.provider,
            providerRef: refund.providerReference,
            status: refund.status === "SUCCESS" ? "COMPLETE" : "PENDING",
          },
        }),
      ]);
      refundedCount++;
    } catch {
      failedRefunds.push(registration.id);
    }
  }

  return NextResponse.json({
    ok: true,
    refunded: refundedCount,
    failedRegistrationIds: failedRefunds,
  });
}
