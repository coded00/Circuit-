/**
 * Circuit — Swiss: a fixed number of rounds, each pairing entries with
 * the same (or nearest) record, never the same opponent twice. Pure
 * functions, unit-tested in swiss.test.ts; match creation/completion in
 * src/lib/matches.ts, page data in src/lib/roundRobinStandings.ts
 * (loadSwiss).
 *
 * - Rounds: ⌈log₂ entries⌉ — enough for one unbeaten entry to emerge.
 * - A round is drawn when every match of the previous one is complete.
 * - Odd fields: the lowest-ranked entry that hasn't had a bye gets one,
 *   counted as a win.
 * - Standings: wins, then Buchholz (the sum of your opponents' wins —
 *   who you beat matters), then score difference. If first is still
 *   level after the last round, a decider between the top two settles it.
 */

import { parseScore, type RRMatch } from "@/lib/roundRobin";

export const SWISS_MAX_ENTRIES = 64;

export function swissRoundsFor(entries: number): number {
  if (entries < 2) return 0;
  return Math.min(entries - 1, Math.max(1, Math.ceil(Math.log2(entries))));
}

export type SwissBye = { round: number; userId: string };

export type SwissRow = {
  entryId: string;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  byes: number;
  buchholz: number;
  diff: number;
};

/** Standings from the regular rounds' matches (1..totalRounds) and byes. */
export function buildSwissTable(entryIds: readonly string[], matches: readonly RRMatch[], byes: readonly SwissBye[]): SwissRow[] {
  const rows = new Map<string, SwissRow>(entryIds.map((id) => [id, { entryId: id, rank: 0, played: 0, wins: 0, losses: 0, byes: 0, buchholz: 0, diff: 0 }]));
  const opponents = new Map<string, string[]>(entryIds.map((id) => [id, []]));
  for (const m of matches) {
    if (!m.complete || !m.winnerId) continue;
    const loserId = m.winnerId === m.playerAId ? m.playerBId : m.playerAId;
    const w = rows.get(m.winnerId);
    const l = rows.get(loserId);
    if (!w || !l) continue;
    w.played++;
    l.played++;
    w.wins++;
    l.losses++;
    opponents.get(m.winnerId)!.push(loserId);
    opponents.get(loserId)!.push(m.winnerId);
    const s = parseScore(m.score);
    if (s) {
      const margin = Math.abs(s[0] - s[1]);
      w.diff += margin;
      l.diff -= margin;
    }
  }
  for (const b of byes) {
    const row = rows.get(b.userId);
    if (row) {
      row.wins++;
      row.byes++;
    }
  }
  for (const row of rows.values()) row.buchholz = opponents.get(row.entryId)!.reduce((sum, o) => sum + (rows.get(o)?.wins ?? 0), 0);
  const compare = (a: SwissRow, b: SwissRow) => b.wins - a.wins || b.buchholz - a.buchholz || b.diff - a.diff;
  const sorted = [...rows.values()].sort(compare);
  sorted.forEach((row, i) => {
    row.rank = i > 0 && compare(sorted[i - 1], row) === 0 ? sorted[i - 1].rank : i + 1;
  });
  return sorted;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * The next round's pairings. `order` is the entries ranked best first
 * (the standings, or a shuffled list for round one). Pairs from the top
 * down, backtracking to avoid rematches; only if no rematch-free pairing
 * exists at all does it allow one.
 */
export function pairSwissRound(
  order: readonly string[],
  matches: readonly Pick<RRMatch, "playerAId" | "playerBId">[],
  byes: readonly SwissBye[]
): { pairs: [string, string][]; bye: string | null } {
  const met = new Set(matches.map((m) => pairKey(m.playerAId, m.playerBId)));
  let pool = [...order];
  let bye: string | null = null;
  if (pool.length % 2 === 1) {
    const hadBye = new Set(byes.map((b) => b.userId));
    bye = [...pool].reverse().find((id) => !hadBye.has(id)) ?? pool[pool.length - 1];
    pool = pool.filter((id) => id !== bye);
  }
  const attempt = (remaining: string[], allowRematch: boolean): [string, string][] | null => {
    if (remaining.length === 0) return [];
    const [first, ...rest] = remaining;
    for (let i = 0; i < rest.length; i++) {
      const opp = rest[i];
      if (!allowRematch && met.has(pairKey(first, opp))) continue;
      const tail = attempt([...rest.slice(0, i), ...rest.slice(i + 1)], allowRematch);
      if (tail) return [[first, opp], ...tail];
    }
    return null;
  };
  const pairs = attempt(pool, false) ?? attempt(pool, true) ?? [];
  return { pairs, bye };
}

export type SwissOutcome =
  | { state: "PLAYING" }
  | { state: "NEXT_ROUND"; round: number }
  | { state: "NEEDS_DECIDER"; between: [string, string] }
  | { state: "DECIDED"; winnerId: string };

/** Where a Swiss stands after a match completes. `decider` is the tiebreak match, if created. */
export function swissOutcome(
  table: readonly SwissRow[],
  regular: readonly RRMatch[],
  totalRounds: number,
  currentRound: number,
  decider: RRMatch | null
): SwissOutcome {
  if (regular.some((m) => !m.complete)) return { state: "PLAYING" };
  if (currentRound < totalRounds) return { state: "NEXT_ROUND", round: currentRound + 1 };
  if (decider) return decider.complete && decider.winnerId ? { state: "DECIDED", winnerId: decider.winnerId } : { state: "PLAYING" };
  const [first, second] = table;
  if (!first) return { state: "PLAYING" };
  if (second && second.rank === first.rank) return { state: "NEEDS_DECIDER", between: [first.entryId, second.entryId] };
  return { state: "DECIDED", winnerId: first.entryId };
}
