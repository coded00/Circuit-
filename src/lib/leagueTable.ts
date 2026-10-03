/**
 * Circuit — leagues: everyone plays everyone (once, or home and away), every
 * match earns points, and the table decides the winner. Pure functions (no
 * database), unit-tested in leagueTable.test.ts; match creation and
 * completion live in src/lib/matches.ts and the page data in
 * src/lib/leagueStandings.ts.
 *
 * Points are set by the organizer (3 for a win is the usual); a draw is worth
 * `drawPoints`, or isn't allowed when that's null. Order: points, then
 * head-to-head points among the entries level on points, then goal/score
 * difference, then goals/score for. Anything still level shares a rank; if
 * that's first place when the last match is done, a decider settles it.
 */

import { roundRobinSchedule, parseScore } from "@/lib/roundRobin";

/** The value a result carries when the match ended level. */
export const DRAW_RESULT = "DRAW";

/** Largest league a tournament can run (16 entries = 120 matches, 240 home and away). */
export const LEAGUE_MAX_ENTRIES = 16;

export type LeagueRules = {
  winPoints: number;
  /** null = draws aren't allowed. */
  drawPoints: number | null;
};

export const DEFAULT_LEAGUE_RULES: LeagueRules = { winPoints: 3, drawPoints: 1 };
export const DEFAULT_MATCHDAY_DAYS = 7;

export type LeagueMatch = {
  id: string;
  round: number | null;
  playerAId: string;
  playerBId: string;
  winnerId: string | null;
  complete: boolean;
  /** Finished level (a draw). */
  draw: boolean;
  /** The agreed score, if any: "2-2", "3-1". */
  score: string | null;
};

export type LeagueRow = {
  entryId: string;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** Goals/score for and against, from the agreed scores. */
  gf: number;
  ga: number;
  gd: number;
  points: number;
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export type LeagueSettings = { winPoints: number; drawPoints: number | null; legs: 1 | 2; matchdayDays: number };

/** Organizer input → validated settings. `allowDraws` false (or drawPoints blank/null) means no draws. */
export function parseLeagueSettings(input: { winPoints?: unknown; drawPoints?: unknown; allowDraws?: unknown; legs?: unknown; matchdayDays?: unknown }): Result<LeagueSettings> {
  const int = (v: unknown, fallback: number) => (v === undefined || v === null || v === "" ? fallback : Number(v));
  const winPoints = int(input.winPoints, 3);
  if (!Number.isInteger(winPoints) || winPoints < 1 || winPoints > 10) return { ok: false, error: "Points for a win must be a whole number from 1 to 10." };
  let drawPoints: number | null = null;
  if (input.allowDraws !== false && input.allowDraws !== "false") {
    const d = int(input.drawPoints, 1);
    if (!Number.isInteger(d) || d < 0 || d >= winPoints) return { ok: false, error: "Points for a draw must be a whole number below the points for a win." };
    drawPoints = d;
  }
  const legs = int(input.legs, 1);
  if (legs !== 1 && legs !== 2) return { ok: false, error: "A league is played once or twice (home and away)." };
  const matchdayDays = int(input.matchdayDays, DEFAULT_MATCHDAY_DAYS);
  if (!Number.isInteger(matchdayDays) || matchdayDays < 1 || matchdayDays > 30) return { ok: false, error: "A matchday lasts from 1 to 30 days." };
  return { ok: true, value: { winPoints, drawPoints, legs, matchdayDays } };
}

/** Fixtures per matchday: the circle method once, then mirrored with home and away swapped for a second leg. */
export function leagueSchedule(ids: readonly string[], legs: 1 | 2): { round: number; pairs: [string, string][] }[] {
  const first = roundRobinSchedule(ids);
  if (legs === 1) return first;
  const second = first.map((r) => ({ round: r.round + first.length, pairs: r.pairs.map(([a, b]) => [b, a] as [string, string]) }));
  return [...first, ...second];
}

export function totalMatchdays(entries: number, legs: 1 | 2): number {
  if (entries < 2) return 0;
  return (entries % 2 === 0 ? entries - 1 : entries) * legs;
}

/** When each matchday is due (matchday 1 is due `days` after the league starts). */
export function matchdayDeadlines(total: number, startMs: number, days: number): string[] {
  return Array.from({ length: total }, (_, i) => new Date(startMs + (i + 1) * days * 86_400_000).toISOString());
}

/** Both sides' goals for a finished match, read from an agreed "3-1" style score. */
function goals(m: LeagueMatch): { a: number; b: number } | null {
  const s = parseScore(m.score);
  if (!s) return null;
  if (m.draw) return { a: s[0], b: s[0] };
  const hi = Math.max(s[0], s[1]);
  const lo = Math.min(s[0], s[1]);
  return m.winnerId === m.playerAId ? { a: hi, b: lo } : { a: lo, b: hi };
}

function pointsFor(m: LeagueMatch, entryId: string, rules: LeagueRules): number {
  if (!m.complete) return 0;
  if (m.draw) return rules.drawPoints ?? 0;
  return m.winnerId === entryId ? rules.winPoints : 0;
}

/** The table, best first. Only regular (non-decider) matches count. */
export function buildLeagueTable(entryIds: readonly string[], matches: readonly LeagueMatch[], rules: LeagueRules): LeagueRow[] {
  const rows = new Map<string, LeagueRow>(entryIds.map((id) => [id, { entryId: id, rank: 0, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0 }]));
  const done = matches.filter((m) => m.complete && (m.draw || m.winnerId));
  for (const m of done) {
    const a = rows.get(m.playerAId);
    const b = rows.get(m.playerBId);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    a.points += pointsFor(m, a.entryId, rules);
    b.points += pointsFor(m, b.entryId, rules);
    if (m.draw) {
      a.draws++;
      b.draws++;
    } else if (m.winnerId === a.entryId) {
      a.wins++;
      b.losses++;
    } else {
      b.wins++;
      a.losses++;
    }
    const g = goals(m);
    if (g) {
      a.gf += g.a;
      a.ga += g.b;
      b.gf += g.b;
      b.ga += g.a;
    }
  }
  for (const r of rows.values()) r.gd = r.gf - r.ga;

  const byPoints = [...rows.values()].sort((x, y) => y.points - x.points);
  const ordered: LeagueRow[] = [];
  let i = 0;
  while (i < byPoints.length) {
    let j = i;
    while (j + 1 < byPoints.length && byPoints[j + 1].points === byPoints[i].points) j++;
    const group = byPoints.slice(i, j + 1);
    if (group.length > 1) {
      const ids = new Set(group.map((g) => g.entryId));
      const h2h = new Map(group.map((g) => [g.entryId, 0]));
      for (const m of done) {
        if (ids.has(m.playerAId) && ids.has(m.playerBId)) {
          h2h.set(m.playerAId, h2h.get(m.playerAId)! + pointsFor(m, m.playerAId, rules));
          h2h.set(m.playerBId, h2h.get(m.playerBId)! + pointsFor(m, m.playerBId, rules));
        }
      }
      group.sort((x, y) => h2h.get(y.entryId)! - h2h.get(x.entryId)! || y.gd - x.gd || y.gf - x.gf);
      group.forEach((row, k) => {
        const prev = group[k - 1];
        const same = prev && h2h.get(prev.entryId) === h2h.get(row.entryId) && prev.gd === row.gd && prev.gf === row.gf;
        row.rank = same ? prev.rank : i + k + 1;
      });
    } else {
      group[0].rank = i + 1;
    }
    ordered.push(...group);
    i = j + 1;
  }
  return ordered;
}

export type LeagueOutcome =
  | { state: "PLAYING" }
  /** Every regular match is done but first place is tied on everything: play a decider between these two. */
  | { state: "NEEDS_DECIDER"; between: [string, string] }
  | { state: "DECIDED"; winnerId: string };

/** Where a league stands. `decider` is the tiebreak match, if one was created (it can't end level). */
export function leagueOutcome(table: readonly LeagueRow[], regular: readonly LeagueMatch[], decider: LeagueMatch | null): LeagueOutcome {
  if (regular.length === 0 || regular.some((m) => !m.complete)) return { state: "PLAYING" };
  if (decider) return decider.complete && decider.winnerId ? { state: "DECIDED", winnerId: decider.winnerId } : { state: "PLAYING" };
  const [first, second] = table;
  if (!first) return { state: "PLAYING" };
  if (second && second.rank === first.rank) return { state: "NEEDS_DECIDER", between: [first.entryId, second.entryId] };
  return { state: "DECIDED", winnerId: first.entryId };
}
