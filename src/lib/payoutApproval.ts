/**
 * Circuit — approving a tournament's payout, by a person on the admin Payouts page or by the sweep.
 * Both go through approveTournamentPayout so the checks, the record and the alerts are the same.
 */
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/auditLog";
import { notify } from "@/lib/notifications";
import { captureException } from "@/lib/observability";
import { releaseDelayHours } from "@/lib/prizePool";
import { reviewTournamentPayout } from "@/lib/payoutReview";

export type ApprovalResult = { ok: true } | { ok: false; error: string; status: number };

export async function approveTournamentPayout(opts: { tournamentId: string; actorId: string | null; note?: string | null }): Promise<ApprovalResult> {
  const tournament = await prisma.tournament.findUnique({ where: { id: opts.tournamentId } });
  if (!tournament) return { ok: false, error: "Tournament not found.", status: 404 };
  if (tournament.payoutApprovedAt) return { ok: false, error: "This payout is already approved.", status: 409 };

  const review = await reviewTournamentPayout(tournament);
  if (review.blockers.length > 0) return { ok: false, error: `Can't approve yet: ${review.blockers.join(" ")}`, status: 409 };

  // Only the call that flips it from "not approved" records the approval and sends the alerts, so two
  // approvals at once (two staff, or staff and the sweep) cannot both go through.
  const claimed = await prisma.tournament.updateMany({
    where: { id: tournament.id, payoutApprovedAt: null, status: "COMPLETE", fundsFrozen: false },
    data: { payoutApprovedAt: new Date(), payoutApprovedById: opts.actorId, payoutApprovalNote: opts.note ?? null },
  });
  if (claimed.count === 0) return { ok: false, error: "This tournament changed while it was being reviewed. Reload and check again.", status: 409 };

  if (opts.actorId) {
    await logAdminAction({
      actorId: opts.actorId,
      action: "tournament.approvePayout",
      targetType: "Tournament",
      targetId: tournament.id,
      metadata: {
        name: tournament.name,
        note: opts.note ?? null,
        collectedForPrizes: review.collectedForPrizes,
        declaredPrize: review.declaredPrize,
        payablePrize: review.payablePrize,
        organizerShare: review.organizerShare,
        winners: review.shares.map((s) => ({ userId: s.userId, place: s.place, payable: s.payable })),
      },
    }).catch((err) => captureException(err, { source: "payoutApproval:audit", tournamentId: tournament.id }));
  }

  // Tell the people the money is for. A failed alert must not undo an approval that has already happened.
  try {
    const delayHours = await releaseDelayHours();
    const claimFrom = tournament.completedAt ? new Date(tournament.completedAt.getTime() + delayHours * 60 * 60 * 1000) : new Date();
    for (const share of review.shares) {
      if (share.payable <= 0) continue;
      await notify(share.userId, "PAYOUT_APPROVED", {
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        amount: share.payable,
        claimFrom: claimFrom.toISOString(),
      });
    }
    if (review.organizerShare > 0) {
      await notify(tournament.organizerId, "ORGANIZER_PAYOUT_APPROVED", {
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        amount: review.organizerShare,
      });
    }
  } catch (err) {
    captureException(err, { source: "payoutApproval:notify", tournamentId: tournament.id });
  }
  return { ok: true };
}

/**
 * Sweep step: approves, without a person, the completed tournaments that have nothing wrong with them. It only
 * considers tournaments past the settlement wait, with no funds freeze and no open dispute, and leaves anything
 * above the platform's auto-approval limit (or with another problem) for staff, noting why on the tournament so
 * the sweep does not keep re-checking it.
 */
export async function autoApprovePayouts(): Promise<{ approved: number; heldForStaff: number; errors?: string[] }> {
  const setting = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  if (setting && setting.payoutAutoApprove === false) return { approved: 0, heldForStaff: 0 };
  const waitHours = setting?.organizerRevenueSettlementHours ?? 24;
  const maxKobo = setting?.payoutAutoApproveMaxKobo ?? 50_000_000;

  const candidates = await prisma.tournament.findMany({
    where: {
      status: "COMPLETE",
      payoutApprovedAt: null,
      payoutApprovalNote: null, // not already flagged for a person
      fundsFrozen: false,
      completedAt: { lte: new Date(Date.now() - waitHours * 60 * 60 * 1000) },
      OR: [{ entryFee: { gt: 0 } }, { prizeAmount: { gt: 0 } }],
      matches: { none: { dispute: { status: { in: ["OPEN", "ORGANIZER_REVIEW", "ESCALATED"] } } } },
    },
    orderBy: { completedAt: "asc" },
    take: 25,
  });

  let approved = 0;
  let heldForStaff = 0;
  const errors: string[] = [];
  for (const tournament of candidates) {
    try {
      const review = await reviewTournamentPayout(tournament);
      if (review.blockers.length > 0) {
        // Open flags and the like clear on their own: look again next time rather than flagging.
        continue;
      }
      const total = review.payablePrize + review.organizerShare;
      if (total > maxKobo) {
        await prisma.tournament.update({ where: { id: tournament.id }, data: { payoutApprovalNote: "Needs staff review: the payout is above the automatic approval limit." } });
        heldForStaff++;
        continue;
      }
      const result = await approveTournamentPayout({ tournamentId: tournament.id, actorId: null, note: "Approved automatically: results settled, no disputes, funds collected." });
      if (result.ok) approved++;
    } catch (err) {
      captureException(err, { source: "sweep:autoApprovePayouts", tournamentId: tournament.id });
      errors.push(`payoutApproval:${tournament.id}`);
    }
  }
  return { approved, heldForStaff, ...(errors.length > 0 ? { errors } : {}) };
}
