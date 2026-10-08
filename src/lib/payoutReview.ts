/**
 * Circuit — what staff look at before approving a tournament's payout: the money actually collected
 * (not the money promised), what winners would be paid out of it, what is left for the organizer, and
 * anything that should stop a release (open disputes, a funds freeze).
 *
 * It also works out, separately from the blockers, whether the money being released is actually *backed*.
 * An ordinary tournament can only ever pay out what it collected, but a staff-run one is sponsored: the
 * entry-fee cap doesn't apply to it (prizePool.ts), so its declared prize can be larger than anything its
 * entry fees paid for. The difference comes out of Circuit's own balance, and `unbackedAmount` is how much.
 * That is a legitimate arrangement, so it is deliberately not a blocker — a person can approve it — but it
 * is the thing a person has to be looking at, so it is reported rather than left to be worked out by hand.
 */
import type { Tournament } from "@prisma/client";
import { prisma } from "@/lib/db";
import { tournamentPrizeShares } from "@/lib/prizePlaces";
import { collectedForPrizes, payableFraction, DEFAULT_MAX_SPONSORED_PRIZE_KOBO } from "@/lib/prizePool";

export type PayoutReview = {
  entryFeesCollected: number;
  platformFees: number;
  collectedForPrizes: number;
  refundedEntries: number;
  declaredPrize: number;
  payablePrize: number;
  organizerShare: number;
  /**
   * The organizer is staff, so the tournament is sponsored: the rule that a prize can't exceed the entry
   * fees it collects doesn't apply to it (prizePool.ts). The prize may therefore be platform money.
   */
  sponsored: boolean;
  /**
   * Kobo of (prizes + the organizer's share) that the entry fees collected do not cover — money that would
   * leave Circuit's own balance rather than this tournament's players'. 0 for every tournament that paid for
   * itself, which is all of them except a sponsored one.
   */
  unbackedAmount: number;
  shares: { userId: string; name: string; place: number; declared: number; payable: number }[];
  openDisputes: number;
  openLobbyFlags: number;
  blockers: string[];
};

export async function reviewTournamentPayout(tournament: Pick<Tournament, "id" | "organizerId" | "status" | "prizeAmount" | "prizeSplit" | "fundsFrozen" | "format" | "competitionStyle" | "placementPoints" | "killPoints" | "lobbyGroups" | "lobbyQualifiers" | "lobbyFinalRounds" | "leagueWinPoints" | "leagueDrawPoints">): Promise<PayoutReview> {
  const sum = (type: "ENTRY_FEE" | "PLATFORM_FEE" | "REFUND", statuses: ("PENDING" | "COMPLETE")[]) =>
    prisma.escrowTransaction.aggregate({ where: { tournamentId: tournament.id, type, status: { in: statuses } }, _sum: { amount: true }, _count: true });
  const [entry, fee, refund, collected, fraction, shares, openDisputes, openLobbyFlags, organizer, setting] = await Promise.all([
    sum("ENTRY_FEE", ["COMPLETE"]),
    sum("PLATFORM_FEE", ["COMPLETE"]),
    sum("REFUND", ["PENDING", "COMPLETE"]),
    collectedForPrizes(tournament.id),
    payableFraction(tournament),
    tournamentPrizeShares(tournament),
    prisma.dispute.count({ where: { match: { tournamentId: tournament.id }, status: { in: ["OPEN", "ORGANIZER_REVIEW", "ESCALATED"] } } }),
    prisma.lobbyFlag.count({ where: { round: { tournamentId: tournament.id }, status: { in: ["OPEN", "ESCALATED"] } } }),
    prisma.user.findUnique({ where: { id: tournament.organizerId }, select: { isStaff: true } }),
    prisma.platformSetting.findUnique({ where: { id: "singleton" }, select: { maxSponsoredPrizeKobo: true } }),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: shares.map((s) => s.userId) } }, select: { id: true, displayName: true } });
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  const declaredPrize = tournament.prizeAmount ?? 0;
  const rows = shares.map((s) => ({ userId: s.userId, name: names.get(s.userId) ?? "Unknown", place: s.place, declared: s.amount, payable: Math.floor(s.amount * fraction) }));
  const payablePrize = rows.reduce((total, r) => total + r.payable, 0);
  const sponsored = organizer?.isStaff ?? false;
  const prizeHold = sponsored ? 0 : Math.min(declaredPrize, collected);
  const organizerShare = Math.max(0, collected - prizeHold);
  // For an ordinary tournament this is always 0: the prize is capped at what was collected, and the
  // organizer's share is whatever is left of it, so the two together can never exceed `collected`. A
  // sponsored tournament is the only way past that, and the excess is the platform's own money.
  const unbackedAmount = Math.max(0, payablePrize + organizerShare - collected);
  const blockers: string[] = [];
  if (tournament.status !== "COMPLETE") blockers.push("The tournament isn't complete yet.");
  if (tournament.fundsFrozen) blockers.push("Funds are frozen.");
  // The sponsored-prize ceiling (maxSponsoredPrizeKobo), checked again here rather than only where the
  // prize was declared. The declaration check is the first line, but a ceiling can be lowered after a
  // tournament was created, and a prize declared under a looser one would otherwise sail straight past
  // it. Blocking here means it stops the money at the door instead — and shows on the Payouts page,
  // where the person about to approve it can see why and what to do about it.
  const sponsoredCap = setting?.maxSponsoredPrizeKobo ?? DEFAULT_MAX_SPONSORED_PRIZE_KOBO;
  if (sponsored && unbackedAmount > sponsoredCap) {
    blockers.push(
      `₦${Math.floor(unbackedAmount / 100).toLocaleString("en-NG")} of this payout is sponsored money and is above the ₦${Math.floor(sponsoredCap / 100).toLocaleString("en-NG")} ceiling for a sponsored prize. Lower the prize, or raise the ceiling in Settings.`
    );
  }
  if (openDisputes > 0) blockers.push(`${openDisputes} dispute${openDisputes === 1 ? "" : "s"} still open.`);
  if (openLobbyFlags > 0) blockers.push(`${openLobbyFlags} lobby result flag${openLobbyFlags === 1 ? "" : "s"} still open.`);
  if (declaredPrize > 0 && rows.length === 0) blockers.push("No winners could be worked out from the results.");
  return {
    entryFeesCollected: entry._sum.amount ?? 0,
    platformFees: fee._sum.amount ?? 0,
    collectedForPrizes: collected,
    refundedEntries: refund._count,
    declaredPrize,
    payablePrize,
    organizerShare,
    sponsored,
    unbackedAmount,
    shares: rows,
    openDisputes,
    openLobbyFlags,
    blockers,
  };
}
