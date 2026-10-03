/**
 * Circuit — loads a league's matches, table and matchday deadlines for its
 * page, the prize claim and the champion card. The rules live in
 * src/lib/leagueTable.ts; match creation/completion in src/lib/matches.ts.
 */

import type { Match } from "@prisma/client";
import { prisma } from "@/lib/db";
import { teamEntryLabels } from "@/lib/teamEntries";
import { buildLeagueTable, DEFAULT_LEAGUE_RULES, DRAW_RESULT, leagueOutcome, type LeagueMatch, type LeagueOutcome, type LeagueRow, type LeagueRules } from "@/lib/leagueTable";

/** The bracket row's JSON for a league. `deadlines[i]` is when matchday i + 1 is due. */
export type LeagueStructure = { type: "LEAGUE"; totalRounds: number; legs: 1 | 2; startedAt: string; deadlines: string[] };

export function isLeagueStructure(s: unknown): s is LeagueStructure {
  return typeof s === "object" && s !== null && (s as { type?: unknown }).type === "LEAGUE";
}

type LeagueTournamentSettings = { leagueWinPoints: number | null; leagueDrawPoints: number | null };

/** A league's points rules. Win points default to 3; a null draw value means draws aren't allowed. */
export function leagueRulesOf(t: LeagueTournamentSettings): LeagueRules {
  return { winPoints: t.leagueWinPoints ?? DEFAULT_LEAGUE_RULES.winPoints, drawPoints: t.leagueDrawPoints };
}

type ResultRow = Pick<Match, "winnerId" | "resultA" | "resultB" | "status">;

/** A finished match ended level: complete, with no winner, and the players said so. */
export function isDrawnMatch(m: ResultRow): boolean {
  return m.status === "COMPLETE" && !m.winnerId && [m.resultA, m.resultB].some((r) => (r as { winnerId?: string } | null)?.winnerId === DRAW_RESULT);
}

/** The score both sides (or the organizer's award) settled on. */
export function agreedLeagueScore(m: ResultRow): string | null {
  const reports = [m.resultA, m.resultB].filter(Boolean) as { winnerId: string; score: string }[];
  const wanted = m.winnerId ?? DRAW_RESULT;
  return reports.find((r) => r.winnerId === wanted)?.score ?? null;
}

export function toLeagueMatch(m: Pick<Match, "id" | "round" | "playerAId" | "playerBId" | "winnerId" | "status" | "resultA" | "resultB">): LeagueMatch {
  return {
    id: m.id,
    round: m.round,
    playerAId: m.playerAId,
    playerBId: m.playerBId,
    winnerId: m.winnerId,
    complete: m.status === "COMPLETE",
    draw: isDrawnMatch(m),
    score: agreedLeagueScore(m),
  };
}

export type LeagueEntry = { userId: string; name: string; handle: string; avatarUrl: string | null; tag: string | null };

export type LeagueView = {
  kind: "LEAGUE";
  totalRounds: number;
  legs: 1 | 2;
  rules: LeagueRules;
  deadlines: string[];
  entries: LeagueEntry[];
  table: LeagueRow[];
  /** `overdue`: a live fixture past its matchday's play-by date. */
  matches: (LeagueMatch & { status: string; decider: boolean; deadline: string | null; overdue: boolean })[];
  decider: LeagueMatch | null;
  outcome: LeagueOutcome;
};

export async function loadLeague(tournament: { id: string; status: string } & LeagueTournamentSettings): Promise<LeagueView | null> {
  const bracket = await prisma.bracket.findUnique({ where: { tournamentId: tournament.id } });
  if (!bracket || !isLeagueStructure(bracket.structure)) return null;
  const { totalRounds, legs, deadlines } = bracket.structure;
  const [regs, rows, labels] = await Promise.all([
    prisma.registration.findMany({
      where: { tournamentId: tournament.id, status: "CONFIRMED" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { handle: true, displayName: true, avatarUrl: true } } },
    }),
    prisma.match.findMany({ where: { tournamentId: tournament.id }, orderBy: [{ round: "asc" }, { createdAt: "asc" }] }),
    teamEntryLabels(tournament.id),
  ]);
  const entries: LeagueEntry[] = regs.map((r) => {
    const team = labels.get(r.userId);
    return { userId: r.userId, name: team?.teamName ?? r.user.displayName, handle: r.user.handle, avatarUrl: team ? null : r.user.avatarUrl, tag: team?.tag ?? null };
  });
  const rules = leagueRulesOf(tournament);
  const now = Date.now();
  const matches = rows.map((m) => {
    const lm = toLeagueMatch(m);
    const decider = (m.round ?? 0) > totalRounds;
    const deadline = decider ? null : (deadlines[(m.round ?? 1) - 1] ?? null);
    const overdue = tournament.status === "LIVE" && m.status !== "COMPLETE" && m.status !== "DISPUTED" && !!deadline && new Date(deadline).getTime() < now;
    return { ...lm, status: m.status, decider, deadline, overdue };
  });
  const regular = matches.filter((m) => !m.decider);
  const decider = matches.find((m) => m.decider) ?? null;
  const table = buildLeagueTable(entries.map((e) => e.userId), regular, rules);
  return { kind: "LEAGUE", totalRounds, legs, rules, deadlines, entries, table, matches, decider, outcome: leagueOutcome(table, regular, decider) };
}
