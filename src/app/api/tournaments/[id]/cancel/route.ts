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
import { notify } from "@/lib/notifications";
import { logAdminAction } from "@/lib/auditLog";

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
  if (tournament.organizerId !== user.id && !user.isStaff) {
    return NextResponse.json(
      { error: "Only the organizer can cancel this tournament." },
      { status: 403 }
    );
  }
  if (tournament.status === "CANCELLED") {
    return NextResponse.json({ error: "Already cancelled." }, { status: 409 });
  }
  if (tournament.status === "COMPLETE") {
    return NextResponse.json(
      { error: "Can't cancel a tournament that's already finished." },
      { status: 409 }
    );
  }
  if (tournament.fundsFrozen) {
    return NextResponse.json(
      { error: "Funds for this tournament are frozen pending review — cancelling would refund them." },
      { status: 409 }
    );
  }
  // Past the lock point, the organizer specifically loses the ability to
  // cancel — staff retain it as the "only admin/system action" escape
  // hatch. This is deliberately a *different* gate from the fundsFrozen
  // one above: fundsFrozen is a staff-initiated hold for a specific
  // investigation, cancellationLockAt is a standing, player-protecting
  // rule that applies to every tournament automatically, organizer intent
  // aside — see its own schema comment for why this can't just be
  // startAt itself.
  if (tournament.cancellationLockAt && new Date() >= tournament.cancellationLockAt && !user.isStaff) {
    return NextResponse.json(
      { error: "Past the cancellation lock — only Circuit staff can cancel this tournament now." },
      { status: 409 }
    );
  }
  // Cancelling after startAt voids the whole event, not just the
  // remaining unplayed matches — every CONFIRMED registrant is refunded
  // below regardless of how far their own match got, and nothing further
  // can happen to any of this tournament's matches afterward (submitResult
  // and ruleDispute both check for CANCELLED status; the sweep's own
  // auto-accept/escalation queries exclude a cancelled tournament's
  // matches too — see their own comments in src/lib/matches.ts).

  const confirmedRegistrations = await prisma.registration.findMany({
    where: { tournamentId: id, status: "CONFIRMED" },
    include: { escrowTxns: true },
  });

  await prisma.tournament.update({ where: { id }, data: { status: "CANCELLED" } });

  // Every confirmed registrant hears about it, not just the ones getting a
  // refund — a free registrant has no money moving but still had plans
  // around this tournament.
  await Promise.all(
    confirmedRegistrations.map((registration) =>
      notify(registration.userId, "TOURNAMENT_CANCELLED", { tournamentId: id })
    )
  );

  const failedRefunds: string[] = [];
  let refundedCount = 0;

  for (const registration of confirmedRegistrations) {
    const paidEntryFeeTxn = registration.escrowTxns.find(
      (txn) => txn.type === "ENTRY_FEE" && txn.status === "COMPLETE"
    );
    if (!paidEntryFeeTxn) continue; // free registration — nothing to refund

    try {
      const provider = getPaymentProvider(paidEntryFeeTxn.provider!); // always set for an ENTRY_FEE row
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

  // Only an admin acting on someone else's tournament is a real "admin
  // action" worth auditing — an organizer cancelling their own event is
  // routine self-service, not something Settings > Audit Log should log.
  if (user.isStaff && tournament.organizerId !== user.id) {
    await logAdminAction({
      actorId: user.id,
      action: "tournament.cancel",
      targetType: "Tournament",
      targetId: id,
      metadata: { name: tournament.name, refunded: refundedCount },
    });
  }

  return NextResponse.json({
    ok: true,
    refunded: refundedCount,
    failedRegistrationIds: failedRefunds,
  });
}
