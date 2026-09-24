/**
 * Circuit — organizer revenue settlement. Every paid entry-fee
 * confirmation (src/lib/payments/confirm.ts, tournaments/[id]/
 * registrations/route.ts's wallet-pay branch) carves out a PENDING
 * `EscrowType.ORGANIZER_REVENUE` row alongside the platform fee — this is
 * the sweep step that turns a tournament's worth of those PENDING rows
 * into a real wallet credit, once the dispute/review buffer after that
 * tournament's final match has passed. Called from runScheduledSweep()
 * (src/lib/matches.ts) — see that function's own doc for why this is one
 * periodic sweep step, not a separate cron entry.
 */

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { captureException } from "@/lib/observability";

/**
 * Settles every tournament whose completedAt + settlement window has
 * passed, with no funds freeze and no unresolved dispute on any of its
 * matches — crediting that tournament's PENDING ORGANIZER_REVENUE rows to
 * the organizer's wallet balance in one shot (a tournament's rows always
 * share one organizer, so one wallet credit per tournament, not per row).
 */
export async function settleOrganizerRevenue(): Promise<{ settled: number; errors?: string[] }> {
  const now = new Date();
  const errors: string[] = [];
  let settled = 0;

  const platformSetting = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  const settlementHours = platformSetting?.organizerRevenueSettlementHours ?? 24;

  const readyTournaments = await prisma.tournament.findMany({
    where: {
      completedAt: { lte: new Date(now.getTime() - settlementHours * 60 * 60 * 1000) },
      fundsFrozen: false,
      escrowTxns: { some: { type: "ORGANIZER_REVENUE", status: "PENDING" } },
      // A dispute still open/under review/escalated on any of this
      // tournament's matches means the final result isn't settled yet —
      // hold the revenue until it resolves, same reasoning as the
      // fundsFrozen check right above.
      matches: { none: { dispute: { status: { in: ["OPEN", "ORGANIZER_REVIEW", "ESCALATED"] } } } },
    },
    select: { id: true, organizerId: true },
  });

  for (const tournament of readyTournaments) {
    try {
      // Conditional updateMany, not a full Serializable transaction — the
      // sweep is a single periodic caller, not multiple concurrent
      // claimants racing a shared resource (contrast the payout route's
      // own comment on why *that* needs the heavier pattern). This is
      // still the real guard, though: only the call that actually flips
      // a row PENDING→COMPLETE credits it, so a sweep retry or overlap
      // can't double-credit.
      //
      // The row set is fetched and pinned to specific ids INSIDE this
      // transaction, not summed from a snapshot taken before it starts —
      // a pre-transaction snapshot could go stale if a new PENDING row
      // landed for this tournament in the gap before commit (a
      // registration confirming concurrently), silently orphaning it:
      // flipped to COMPLETE by a broader updateMany's WHERE clause, but
      // its amount never included in what got credited. Scoping to these
      // exact ids means a concurrently-inserted row is simply left
      // PENDING, untouched, for the next sweep run to pick up correctly —
      // never silently skipped.
      const credited = await prisma.$transaction(async (tx) => {
        const pendingRows = await tx.escrowTransaction.findMany({
          where: { tournamentId: tournament.id, type: "ORGANIZER_REVENUE", status: "PENDING" },
          select: { id: true },
        });
        if (pendingRows.length === 0) return 0;
        const ids = pendingRows.map((row) => row.id);

        const updated = await tx.escrowTransaction.updateMany({
          where: { id: { in: ids }, status: "PENDING" },
          data: { status: "COMPLETE" },
        });
        if (updated.count === 0) return 0;

        // Sum exactly the rows this call flipped (re-selected, not the
        // pre-update snapshot) — correct even in the unlikely case some
        // of `ids` were already claimed by a concurrent call in between.
        const flippedRows = await tx.escrowTransaction.findMany({
          where: { id: { in: ids }, status: "COMPLETE" },
          select: { amount: true },
        });
        const flippedTotal = flippedRows.reduce((sum, row) => sum + row.amount, 0);
        if (flippedTotal <= 0) return 0;

        await tx.user.update({
          where: { id: tournament.organizerId },
          data: { walletBalance: { increment: flippedTotal } },
        });
        await tx.walletTransaction.create({
          data: {
            userId: tournament.organizerId,
            type: "ORGANIZER_REVENUE_CREDIT",
            amount: flippedTotal,
            status: "COMPLETE",
          },
        });
        return flippedTotal;
      });

      if (credited > 0) {
        settled++;
        await notify(tournament.organizerId, "ORGANIZER_REVENUE_SETTLED", { tournamentId: tournament.id });
      }
    } catch (err) {
      console.error(`[settlement] Error settling organizer revenue for tournament ${tournament.id}:`, err);
      // V1 audit follow-up: same reasoning as the sweep's own catches —
      // a recurring settlement failure previously only reached the
      // console, with no human watching a timer-driven job.
      captureException(err, { source: "settlement:settleOrganizerRevenue", tournamentId: tournament.id });
      errors.push(`tournament:${tournament.id}`);
    }
  }

  return { settled, ...(errors.length > 0 ? { errors } : {}) };
}
