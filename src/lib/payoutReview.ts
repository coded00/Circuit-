/**
 * Circuit — what staff look at before approving a tournament's payout: the money actually collected
 * (not the money promised), what winners would be paid out of it, what is left for the organizer, and
 * anything that should stop a release (open disputes, a funds freeze).
 */
import type { Tournament } from "@prisma/client";
import { prisma } from "@/lib/db";
import { tournamentPrizeShares } from "@/lib/prizePlaces";
import { collectedForPrizes, payableFraction } from "@/lib/prizePool";

export type PayoutReview = {
  entryFeesCollected: number;
  platformFees: number;
  collectedForPrizes: number;
  refundedEntries: number;
  declaredPrize: number;
  payablePrize: number;
  organizerShare: number;
  shares: { userId: string; name: string; place: number; declared: number; payable: number }[];
  openDisputes: number;
  openLobbyFlags: number;
  blockers: string[];
};

export async function reviewTournamentPayout(tournament: Pick<Tournament, "id" | "organizerId" | "status" | "prizeAmount" | "prizeSplit" | "fundsFrozen" | "format" | "competitionStyle" | "placementPoints" | "killPoints" | "lobbyGroups" | "lobbyQualifiers" | "lobbyFinalRounds" | "leagueWinPoints" | "leagueDrawPoints">): Promise<PayoutReview> {
  const sum = (type: "ENTRY_FEE" | "PLATFORM_FEE" | "REFUND", statuses: ("PENDING" | "COMPLETE")[]) =>
    prisma.escrowTransaction.aggregate({ where: { tournamentId: tournament.id, type, status: { in: statuses } }, _sum: { amount: true }, _count: true });
  const [entry, fee, refund, collected, fraction, shares, openDisputes, openLobbyFlags, organizer] = await Promise.all([
    sum("ENTRY_FEE", ["COMPLETE"]),
    sum("PLATFORM_FEE", ["COMPLETE"]),
    sum("REFUND", ["PENDING", "COMPLETE"]),
    collectedForPrizes(tournament.id),
    payableFraction(tournament),
    tournamentPrizeShares(tournament),
    prisma.dispute.count({ where: { match: { tournamentId: tournament.id }, status: { in: ["OPEN", "ORGANIZER_REVIEW", "ESCALATED"] } } }),
    prisma.lobbyFlag.count({ where: { round: { tournamentId: tournament.id }, status: { in: ["OPEN", "ESCALATED"] } } }),
    prisma.user.findUnique({ where: { id: tournament.organizerId }, select: { isStaff: true } }),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: shares.map((s) => s.userId) } }, select: { id: true, displayName: true } });
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  const declaredPrize = tournament.prizeAmount ?? 0;
  const rows = shares.map((s) => ({ userId: s.userId, name: names.get(s.userId) ?? "Unknown", place: s.place, declared: s.amount, payable: Math.floor(s.amount * fraction) }));
  const payablePrize = rows.reduce((total, r) => total + r.payable, 0);
  const prizeHold = organizer?.isStaff ? 0 : Math.min(declaredPrize, collected);
  const blockers: string[] = [];
  if (tournament.status !== "COMPLETE") blockers.push("The tournament isn't complete yet.");
  if (tournament.fundsFrozen) blockers.push("Funds are frozen.");
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
    organizerShare: Math.max(0, collected - prizeHold),
    shares: rows,
    openDisputes,
    openLobbyFlags,
    blockers,
  };
}
