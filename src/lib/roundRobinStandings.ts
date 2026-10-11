/**
 * Circuit — loads a round robin tournament's matches and standings for
 * its page, the prize claim and the champion card. The rules live in
 * src/lib/roundRobin.ts; match creation/completion in src/lib/matches.ts.
 */

import type { Match } from "@prisma/client";
import { prisma } from "@/lib/db";
import { teamEntryLabels } from "@/lib/teamEntries";
import { buildRoundRobinTable, roundRobinOutcome, type RoundRobinOutcome, type RRMatch, type RRRow } from "@/lib/roundRobin";
import { buildSwissTable, swissOutcome, type SwissBye, type SwissRow } from "@/lib/swiss";

/** The bracket row's JSON for a round robin (a knockout stores its tree instead). */
export type RoundRobinStructure = { type: "ROUND_ROBIN"; totalRounds: number };

export function isRoundRobinStructure(s: unknown): s is RoundRobinStructure {
  return typeof s === "object" && s !== null && (s as { type?: unknown }).type === "ROUND_ROBIN";
}

/** The score both sides (or the ruling) settled on — whichever report named the actual winner. */
export function agreedScore(m: Pick<Match, "winnerId" | "resultA" | "resultB">): string | null {
  const reports = [m.resultA, m.resultB].filter(Boolean) as { winnerId: string; score: string }[];
  return m.winnerId ? (reports.find((r) => r.winnerId === m.winnerId)?.score ?? null) : null;
}

export function toRRMatch(m: Pick<Match, "id" | "round" | "playerAId" | "playerBId" | "winnerId" | "status" | "resultA" | "resultB">): RRMatch {
  return { id: m.id, round: m.round, playerAId: m.playerAId, playerBId: m.playerBId, winnerId: m.winnerId, complete: m.status === "COMPLETE", score: agreedScore(m) };
}

export type RREntry = { userId: string; name: string; handle: string; avatarUrl: string | null; tag: string | null };

export type RoundRobinView = {
  kind?: "ROUND_ROBIN";
  totalRounds: number;
  entries: RREntry[];
  table: RRRow[];
  matches: (RRMatch & { status: string; decider: boolean })[];
  decider: RRMatch | null;
  outcome: RoundRobinOutcome;
};

export async function loadRoundRobin(tournamentId: string): Promise<RoundRobinView | null> {
  const bracket = await prisma.bracket.findUnique({ where: { tournamentId } });
  if (!bracket || !isRoundRobinStructure(bracket.structure)) return null;
  const { totalRounds } = bracket.structure;
  const [regs, rows, labels] = await Promise.all([
    prisma.registration.findMany({
      where: { tournamentId, status: "CONFIRMED" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { handle: true, displayName: true, avatarUrl: true } } },
    }),
    prisma.match.findMany({ where: { tournamentId }, orderBy: [{ round: "asc" }, { createdAt: "asc" }] }),
    teamEntryLabels(tournamentId),
  ]);
  const entries: RREntry[] = regs.map((r) => {
    const team = labels.get(r.userId);
    return { userId: r.userId, name: team?.teamName ?? r.user.displayName, handle: r.user.handle, avatarUrl: team ? null : r.user.avatarUrl, tag: team?.tag ?? null };
  });
  const matches = rows.map((m) => ({ ...toRRMatch(m), status: m.status, decider: (m.round ?? 0) > totalRounds }));
  const regular = matches.filter((m) => !m.decider);
  const decider = matches.find((m) => m.decider) ?? null;
  const table = buildRoundRobinTable(entries.map((e) => e.userId), regular);
  return { totalRounds, entries, table, matches, decider, outcome: roundRobinOutcome(table, regular, decider) };
}

// ----------------------------------------------------------- Swiss

/** The bracket row's JSON for a Swiss (src/lib/swiss.ts). */
export type SwissStructure = { type: "SWISS"; totalRounds: number; currentRound: number; byes: SwissBye[] };

export function isSwissStructure(s: unknown): s is SwissStructure {
  return typeof s === "object" && s !== null && (s as { type?: unknown }).type === "SWISS";
}

export type SwissView = Omit<RoundRobinView, "kind" | "table" | "outcome"> & {
  kind: "SWISS";
  table: SwissRow[];
  byes: SwissBye[];
  currentRound: number;
  outcome: RoundRobinOutcome;
};

export async function loadSwiss(tournamentId: string): Promise<SwissView | null> {
  const bracket = await prisma.bracket.findUnique({ where: { tournamentId } });
  if (!bracket || !isSwissStructure(bracket.structure)) return null;
  const { totalRounds, currentRound, byes } = bracket.structure;
  const [regs, rows, labels] = await Promise.all([
    prisma.registration.findMany({
      where: { tournamentId, status: "CONFIRMED" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { handle: true, displayName: true, avatarUrl: true } } },
    }),
    prisma.match.findMany({ where: { tournamentId }, orderBy: [{ round: "asc" }, { createdAt: "asc" }] }),
    teamEntryLabels(tournamentId),
  ]);
  const entries: RREntry[] = regs.map((r) => {
    const team = labels.get(r.userId);
    return { userId: r.userId, name: team?.teamName ?? r.user.displayName, handle: r.user.handle, avatarUrl: team ? null : r.user.avatarUrl, tag: team?.tag ?? null };
  });
  const matches = rows.map((m) => ({ ...toRRMatch(m), status: m.status, decider: (m.round ?? 0) > totalRounds }));
  const regular = matches.filter((m) => !m.decider);
  const decider = matches.find((m) => m.decider) ?? null;
  const table = buildSwissTable(entries.map((e) => e.userId), regular, byes);
  const raw = swissOutcome(table, regular, totalRounds, currentRound, decider);
  const outcome: RoundRobinOutcome = raw.state === "NEXT_ROUND" ? { state: "PLAYING" } : raw;
  return { kind: "SWISS", totalRounds, currentRound, byes, entries, table, matches, decider, outcome };
}

/** Round robin or Swiss standings for a tournament, whichever it runs. */
export async function loadLeagueStandings(tournament: { id: string; format: string }): Promise<RoundRobinView | SwissView | null> {
  if (tournament.format === "SWISS") return loadSwiss(tournament.id);
  if (tournament.format === "ROUND_ROBIN") return loadRoundRobin(tournament.id);
  return null;
}
