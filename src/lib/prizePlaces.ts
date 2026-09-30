/**
 * Circuit — who finished where in a completed tournament, in the shape
 * split prizes need (src/lib/prizes.ts): finishing groups in order, with
 * entries level on a place grouped together.
 *
 * - Knockout: champion, the losing finalist, then the semi-final losers
 *   sharing 3rd (there's no 3rd-place match).
 * - Round robin: the standings; a decider fixes 1st and 2nd.
 * - Lobby: the leaderboard.
 *
 * User ids are the entries' users — the captain, for team entries.
 */

import type { Tournament } from "@prisma/client";
import { prisma } from "@/lib/db";
import { loadLobby } from "@/lib/lobby";
import { loadLeagueStandings } from "@/lib/roundRobinStandings";
import { doubleElimPlacements, isDoubleElimStructure } from "@/lib/doubleElim";
import { prizeShares, type FinishGroup, type PrizeShare } from "@/lib/prizes";
import { splitByBasisPoints } from "@/lib/teamPrize";

type TournamentShape = Pick<
  Tournament,
  "id" | "status" | "format" | "competitionStyle" | "placementPoints" | "killPoints" | "lobbyGroups" | "lobbyQualifiers" | "lobbyFinalRounds"
>;

function groupByRank<T>(rows: readonly T[], rank: (r: T) => number, id: (r: T) => string): FinishGroup[] {
  const groups: FinishGroup[] = [];
  let last: number | null = null;
  for (const row of rows) {
    if (last === rank(row) && groups.length) groups[groups.length - 1].userIds.push(id(row));
    else groups.push({ userIds: [id(row)] });
    last = rank(row);
  }
  return groups;
}

/** Finishing order of a COMPLETE tournament, or null while it's running. */
export async function finishingGroups(tournament: TournamentShape): Promise<FinishGroup[] | null> {
  if (tournament.status !== "COMPLETE") return null;

  if (tournament.competitionStyle === "LOBBY") {
    const view = await loadLobby(tournament);
    const userOf = new Map(view.entries.map((e) => [e.registrationId, e.userId]));
    return groupByRank(view.board, (r) => r.rank, (r) => userOf.get(r.registrationId)!);
  }

  if (tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") {
    const view = await loadLeagueStandings(tournament);
    if (!view || view.outcome.state !== "DECIDED") return null;
    if (view.decider?.winnerId) {
      const winner = view.decider.winnerId;
      const loser = view.decider.playerAId === winner ? view.decider.playerBId : view.decider.playerAId;
      const rest = (view.table as { entryId: string; rank: number }[]).filter((r) => r.entryId !== winner && r.entryId !== loser);
      return [{ userIds: [winner] }, { userIds: [loser] }, ...groupByRank(rest, (r) => r.rank, (r) => r.entryId)];
    }
    return groupByRank(view.table as { entryId: string; rank: number }[], (r) => r.rank, (r) => r.entryId);
  }

  if (tournament.format === "DOUBLE_ELIMINATION") {
    const bracket = await prisma.bracket.findUnique({ where: { tournamentId: tournament.id } });
    if (!isDoubleElimStructure(bracket?.structure)) return null;
    const { first, second, third } = doubleElimPlacements(bracket.structure);
    if (!first) return null;
    return [first, second, third].filter((id): id is string => !!id).map((id) => ({ userIds: [id] }));
  }

  // Knockout: the final, then the semi-finals.
  const matches = await prisma.match.findMany({ where: { tournamentId: tournament.id, round: { not: null }, status: "COMPLETE" } });
  const lastRound = Math.max(0, ...matches.map((m) => m.round ?? 0));
  const final = matches.find((m) => m.round === lastRound);
  if (!final?.winnerId) return null;
  const loserOf = (m: (typeof matches)[number]) => (m.winnerId === m.playerAId ? m.playerBId : m.playerAId);
  const groups: FinishGroup[] = [{ userIds: [final.winnerId] }, { userIds: [loserOf(final)] }];
  const semiLosers = matches.filter((m) => m.round === lastRound - 1 && m.winnerId).map(loserOf);
  if (semiLosers.length) groups.push({ userIds: semiLosers });
  return groups;
}

/** Everyone's share of a completed tournament's cash prize ([] if none). */
export async function tournamentPrizeShares(tournament: TournamentShape & Pick<Tournament, "prizeAmount" | "prizeSplit">): Promise<PrizeShare[]> {
  if (!tournament.prizeAmount || tournament.prizeAmount <= 0) return [];
  const groups = await finishingGroups(tournament);
  if (!groups) return [];
  return expandTeamShares(tournament.id, prizeShares(tournament.prizeAmount, tournament.prizeSplit, groups));
}

/**
 * A team entry's place share (keyed to its captain, see the top of this file)
 * becomes one share per roster player, by the percentages the captain set when
 * entering. Entries made before prizes were shared have no percentages and keep
 * paying the captain.
 */
export async function expandTeamShares(tournamentId: string, shares: PrizeShare[]): Promise<PrizeShare[]> {
  if (shares.length === 0) return shares;
  const rosters = await prisma.rosterMember.findMany({
    where: {
      registration: { tournamentId, userId: { in: shares.map((s) => s.userId) }, status: "CONFIRMED", teamId: { not: null } },
      prizeBp: { not: null },
    },
    select: { userId: true, prizeBp: true, registration: { select: { userId: true } } },
    orderBy: { createdAt: "asc" },
  });
  const byCaptain = new Map<string, { userId: string; bp: number }[]>();
  for (const m of rosters) {
    const list = byCaptain.get(m.registration.userId) ?? [];
    // The captain first: any odd kobo go to them.
    if (m.userId === m.registration.userId) list.unshift({ userId: m.userId, bp: m.prizeBp! });
    else list.push({ userId: m.userId, bp: m.prizeBp! });
    byCaptain.set(m.registration.userId, list);
  }
  return shares.flatMap((share) => {
    const team = byCaptain.get(share.userId);
    if (!team) return [share];
    return splitByBasisPoints(share.amount, team)
      .filter((part) => part.amount > 0)
      .map((part) => ({ ...share, userId: part.userId, amount: part.amount }));
  });
}
