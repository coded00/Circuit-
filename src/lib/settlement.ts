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
      const pendingRows = await prisma.escrowTransaction.findMany({
        where: { tournamentId: tournament.id, type: "ORGANIZER_REVENUE", status: "PENDING" },
      });
      const total = pendingRows.reduce((sum, row) => sum + row.amount, 0);
      if (total <= 0) continue;

      // Conditional updateMany, not a full Serializable transaction — the
      // sweep is a single periodic caller, not multiple concurrent
      // claimants racing a shared resource (contrast the payout route's
      // own comment on why *that* needs the heavier pattern). This is
      // still the real guard, though: only the call that actually flips
      // every row PENDING→COMPLETE credits the wallet, so a sweep retry
      // or overlap can't double-credit.
      const credited = await prisma.$transaction(async (tx) => {
        const updated = await tx.escrowTransaction.updateMany({
          where: { tournamentId: tournament.id, type: "ORGANIZER_REVENUE", status: "PENDING" },
          data: { status: "COMPLETE" },
        });
        if (updated.count === 0) return false;

        await tx.user.update({
          where: { id: tournament.organizerId },
          data: { walletBalance: { increment: total } },
        });
        await tx.walletTransaction.create({
          data: {
            userId: tournament.organizerId,
            type: "ORGANIZER_REVENUE_CREDIT",
            amount: total,
            status: "COMPLETE",
          },
        });
        return true;
      });

      if (credited) {
        settled++;
        await notify(tournament.organizerId, "ORGANIZER_REVENUE_SETTLED", { tournamentId: tournament.id });
      }
    } catch (err) {
      console.error(`[settlement] Error settling organizer revenue for tournament ${tournament.id}:`, err);
      errors.push(`tournament:${tournament.id}`);
    }
  }

  return { settled, ...(errors.length > 0 ? { errors } : {}) };
}
