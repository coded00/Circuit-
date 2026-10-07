/**
 * Circuit — approving a tournament's payout, by a person on the admin Payouts page or by the sweep.
 * Both go through approveTournamentPayout so the checks, the record and the alerts are the same.
 *
 * Approving is the moment money is allowed to leave, and some of it can be Circuit's own. Two rules keep
 * that to money the platform actually meant to spend:
 *
 * - A person can't approve a payout for a tournament they organize, or one that pays them a prize. Both can
 *   only ever apply to a staff member (the route already requires staff), and they are the whole point: a
 *   staff-run tournament's prize is platform money, so the one arrangement that must not be possible is the
 *   organizer deciding alone to pay it out — including to themselves.
 * - An automatic approval (`actorId: null`) never releases money the entry fees didn't cover. A sponsorship
 *   is a decision someone makes, so it has to be a named person who makes it, and the audit row has to name
 *   them (see the note on `unbackedAmount` in payoutReview.ts).
 * - That person is approving a stated amount from a stated source. A sponsored payout whose unbacked amount
 *   isn't covered by a recorded TournamentSponsorship is refused outright, for everyone (src/lib/sponsorship.ts).
 */
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/auditLog";
import { notify } from "@/lib/notifications";
import { captureException } from "@/lib/observability";
import { releaseDelayHours } from "@/lib/prizePool";
import { reviewTournamentPayout } from "@/lib/payoutReview";
import { sponsorshipRefusal } from "@/lib/sponsorship";

export type ApprovalResult = { ok: true } | { ok: false; error: string; status: number };

export async function approveTournamentPayout(opts: { tournamentId: string; actorId: string | null; note?: string | null }): Promise<ApprovalResult> {
  const tournament = await prisma.tournament.findUnique({ where: { id: opts.tournamentId } });
  if (!tournament) return { ok: false, error: "Tournament not found.", status: 404 };
  if (tournament.payoutApprovedAt) return { ok: false, error: "This payout is already approved.", status: 409 };

  const review = await reviewTournamentPayout(tournament);

  // Separation of duties, checked before anything else about the money: whoever is asking is not allowed to
  // be a beneficiary of the answer. `actorId === organizerId` is unreachable for an ordinary organizer (the
  // route requires staff), so in practice this is the sponsored-tournament case — the organizer is staff and
  // the prize is the platform's money. Refusing here is the whole control; there is no override, deliberately.
  // On a deployment with only one staff member that means a staff member's own tournament needs a second
  // staff member to release its prize, which is the intended trade: the alternative is one person sending
  // platform money to a prize place they chose.
  if (opts.actorId) {
    if (opts.actorId === tournament.organizerId) {
      return { ok: false, error: "You organize this tournament, so you can't approve its payout. Ask another staff member to review it.", status: 403 };
    }
    if (review.shares.some((s) => s.userId === opts.actorId && s.payable > 0)) {
      return { ok: false, error: "This payout would pay you a prize, so you can't approve it. Ask another staff member to review it.", status: 403 };
    }
  }

  if (review.blockers.length > 0) return { ok: false, error: `Can't approve yet: ${review.blockers.join(" ")}`, status: 409 };

  // The sweep's own guard against this is in autoApprovePayouts (which skips and flags these rather than
  // calling in), but the rule belongs here too: this is the only door money leaves by, and a future caller
  // that forgets must not be able to open it. Money the entry fees didn't cover is a decision, and a decision
  // needs a person attached to it — not "the system".
  if (!opts.actorId && review.unbackedAmount > 0) {
    return { ok: false, error: "This payout is bigger than the entry fees collected, so it needs a named staff member to approve it.", status: 409 };
  }

  // And even a named person has to be approving something specific. Money from Circuit's balance needs a
  // recorded statement of where it is coming from (TournamentSponsorship) covering the unbacked amount —
  // otherwise the separation-of-duties rule above only guarantees a second person agreed, without either
  // of them having written down what to. There is no override, deliberately, and no exception for a super
  // admin: the point is the record, and a role that can skip it is a role that will.
  const sponsorshipRefusalMessage = sponsorshipRefusal({ unbackedAmount: review.unbackedAmount, sponsorship: review.sponsorship });
  if (sponsorshipRefusalMessage) {
    return { ok: false, error: sponsorshipRefusalMessage, status: 409 };
  }

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
        // Who this money is for, on the same row as who approved it — the two facts the separation-of-duties
        // check above is about, so an audit can see them together without a join.
        organizerId: tournament.organizerId,
        sponsored: review.sponsored,
        unbackedAmount: review.unbackedAmount,
        // What the approver was agreeing to, when it was platform money: the source and the amount they
        // were shown. Without this the row names who said yes and still not what they said yes to.
        sponsorship: review.sponsorship
          ? { source: review.sponsorship.source, amountKobo: review.sponsorship.amountKobo, recordedByName: review.sponsorship.recordedByName }
          : null,
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
 * above the platform's auto-approval limit, anything whose payout the entry fees didn't cover, and anything
 * else with a problem for staff — noting why on the tournament, so the sweep does not keep re-checking it.
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
      // Money the entry fees didn't cover — a staff-run (sponsored) tournament's prize — is never approved
      // automatically, whatever the amount. The auto-approval limit is a convenience for payouts that were
      // always going to happen; this is a decision about spending Circuit's own balance, and it has to have a
      // person's name on it. Flagged with a note rather than left silent, which is also what stops the next
      // sweep from re-checking it (the candidates query skips tournaments that already have a note).
      if (review.unbackedAmount > 0) {
        await prisma.tournament.update({
          where: { id: tournament.id },
          data: { payoutApprovalNote: `Needs staff review: ₦${Math.floor(review.unbackedAmount / 100).toLocaleString("en-NG")} of this payout isn't covered by the entry fees collected, so it comes out of Circuit's own balance.` },
        });
        heldForStaff++;
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
