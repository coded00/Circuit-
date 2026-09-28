/**
 * Circuit — round robin: every entry plays every other entry once. Pure
 * functions (no database), unit-tested in roundRobin.test.ts; the match
 * creation and completion live in src/lib/matches.ts and the page data
 * in src/lib/roundRobinStandings.ts.
 *
 * Matches are ordinary Match rows (same ready/report/dispute flow as a
 * bracket), grouped into rounds by the circle method so nobody plays
 * twice in a round; with an odd number of entries one sits out each
 * round. Players can play their matches in any order.
 *
 * Standings: most wins first. Ties break on head-to-head wins between
 * the tied entries, then score difference (from the agreed "3-1"-style
 * score, credited to the winner and debited from the loser). If first
 * place is still level after that, a decider match between the top two
 * settles the champion.
 */

/** Largest round robin a tournament can run (16 entries = 120 matches). */
export const ROUND_ROBIN_MAX_ENTRIES = 16;

/** Pairings per round via the circle method. `null` entries are byes. */
export function roundRobinSchedule(ids: readonly string[]): { round: number; pairs: [string, string][] }[] {
  const list: (string | null)[] = [...ids];
  if (list.length < 2) return [];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: { round: number; pairs: [string, string][] }[] = [];
  let rotation = list.slice();
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = rotation[i];
      const b = rotation[n - 1 - i];
      if (a && b) pairs.push(r % 2 === 0 ? [a, b] : [b, a]); // alternate who's listed first
    }
    rounds.push({ round: r + 1, pairs });
    // Keep the first fixed, rotate the rest clockwise.
    rotation = [rotation[0], rotation[n - 1], ...rotation.slice(1, n - 1)];
  }
  return rounds;
}

export function totalRoundRobinRounds(entries: number): number {
  if (entries < 2) return 0;
  return entries % 2 === 0 ? entries - 1 : entries;
}

/** "3-1", "3 : 1", "2–0" → [3, 1]; anything else → null. */
export function parseScore(score: string | null | undefined): [number, number] | null {
  if (!score) return null;
  const m = score.trim().match(/^(\d{1,3})\s*[-–:x]\s*(\d{1,3})$/i);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export type RRMatch = {
  id: string;
  round: number | null;
  playerAId: string;
  playerBId: string;
  winnerId: string | null;
  complete: boolean;
  /** The agreed score, if any. */
  score: string | null;
};

export type RRRow = {
  entryId: string;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  /** Score difference across completed matches with a readable score. */
  diff: number;
};

/**
 * Standings from the regular (non-decider) matches. Entries level on
 * wins are ordered by head-to-head wins among just those entries, then
 * score difference; any still level share a rank.
 */
export function buildRoundRobinTable(entryIds: readonly string[], matches: readonly RRMatch[]): RRRow[] {
  const rows = new Map<string, RRRow>(entryIds.map((id) => [id, { entryId: id, rank: 0, played: 0, wins: 0, losses: 0, diff: 0 }]));
  const done = matches.filter((m) => m.complete && m.winnerId);
  for (const m of done) {
    const winner = rows.get(m.winnerId!);
    const loserId = m.winnerId === m.playerAId ? m.playerBId : m.playerAId;
    const loser = rows.get(loserId);
    if (!winner || !loser) continue;
    winner.played++;
    loser.played++;
    winner.wins++;
    loser.losses++;
    const s = parseScore(m.score);
    if (s) {
      const margin = Math.abs(s[0] - s[1]);
      winner.diff += margin;
      loser.diff -= margin;
    }
  }

  const byWins = [...rows.values()].sort((a, b) => b.wins - a.wins);
  const ordered: RRRow[] = [];
  let i = 0;
  while (i < byWins.length) {
    let j = i;
    while (j + 1 < byWins.length && byWins[j + 1].wins === byWins[i].wins) j++;
    const group = byWins.slice(i, j + 1);
    if (group.length > 1) {
      const ids = new Set(group.map((g) => g.entryId));
      const h2h = new Map(group.map((g) => [g.entryId, 0]));
      for (const m of done) if (ids.has(m.playerAId) && ids.has(m.playerBId)) h2h.set(m.winnerId!, (h2h.get(m.winnerId!) ?? 0) + 1);
      group.sort((a, b) => h2h.get(b.entryId)! - h2h.get(a.entryId)! || b.diff - a.diff);
      // Rank: level on wins, head-to-head and difference = shared rank.
      group.forEach((row, k) => {
        const prev = group[k - 1];
        row.rank = prev && h2h.get(prev.entryId) === h2h.get(row.entryId) && prev.diff === row.diff ? prev.rank : i + k + 1;
      });
    } else {
      group[0].rank = i + 1;
    }
    ordered.push(...group);
    i = j + 1;
  }
  return ordered;
}

export type RoundRobinOutcome =
  | { state: "PLAYING" }
  /** Every regular match is done but first place is tied: play a decider between these two. */
  | { state: "NEEDS_DECIDER"; between: [string, string] }
  | { state: "DECIDED"; winnerId: string };

/**
 * Where a round robin stands. `decider` is the tiebreak match, if one was
 * created. With no decider needed, the outright leader wins.
 */
export function roundRobinOutcome(table: readonly RRRow[], regular: readonly RRMatch[], decider: RRMatch | null): RoundRobinOutcome {
  if (regular.length === 0 || regular.some((m) => !m.complete)) return { state: "PLAYING" };
  if (decider) return decider.complete && decider.winnerId ? { state: "DECIDED", winnerId: decider.winnerId } : { state: "PLAYING" };
  const [first, second] = table;
  if (!first) return { state: "PLAYING" };
  if (second && second.rank === first.rank) return { state: "NEEDS_DECIDER", between: [first.entryId, second.entryId] };
  return { state: "DECIDED", winnerId: first.entryId };
}
