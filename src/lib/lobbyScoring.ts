/**
 * Circuit — lobby (battle royale) scoring, game catalog phase 4. Pure
 * functions only (no database), safe in client components and unit-tested
 * in lobbyScoring.test.ts.
 *
 * A lobby tournament is one lobby that plays several rounds. Each round
 * the organizer enters every entry's finishing place and kills; points =
 * the place's value in the tournament's placement table + kills × points
 * per kill. The table comes from the format (Admin → Games) and is
 * snapshotted onto the tournament, so every tournament of a format
 * scores the same way and later catalog edits don't move a live one.
 */

/** The table used when a format doesn't set its own: 1st 10, 2nd 6, 3rd 5, 4th 4, 5th 3, 6th 2, 7th–8th 1. */
export const STANDARD_PLACEMENT_POINTS: readonly number[] = [10, 6, 5, 4, 3, 2, 1, 1];
export const STANDARD_KILL_POINTS = 1;
export const MAX_LOBBY_ROUNDS = 20;
export const DEFAULT_LOBBY_ROUNDS = 4;
export const MAX_KILLS = 999;
const MAX_POINTS = 1000;
const MAX_PLACES = 100;

export type PointsTable = { placementPoints: readonly number[]; killPoints: number };

/** A format's table, falling back to the standard one when it has none. */
export function effectiveTable(t: { placementPoints: readonly number[]; killPoints: number }): PointsTable {
  return t.placementPoints.length > 0 ? { placementPoints: [...t.placementPoints], killPoints: t.killPoints } : { placementPoints: [...STANDARD_PLACEMENT_POINTS], killPoints: t.killPoints };
}

export function placementPointsFor(placement: number | null, table: PointsTable): number {
  if (placement === null || placement < 1) return 0;
  return table.placementPoints[placement - 1] ?? 0;
}

export function pointsFor(placement: number | null, kills: number, table: PointsTable): number {
  if (placement === null) return 0; // didn't play: no placement, no kills
  return placementPointsFor(placement, table) + kills * table.killPoints;
}

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/** "1st 10 · 2nd 6 · 3rd 5 · … · 7th–8th 1 · 1 per kill". Consecutive places with equal points are grouped. */
export function describePoints(table: PointsTable): string {
  const parts: string[] = [];
  const pts = table.placementPoints;
  let i = 0;
  while (i < pts.length) {
    let j = i;
    while (j + 1 < pts.length && pts[j + 1] === pts[i]) j++;
    if (pts[i] > 0) parts.push(`${i === j ? ordinal(i + 1) : `${ordinal(i + 1)}–${ordinal(j + 1)}`} ${pts[i]}`);
    i = j + 1;
  }
  if (table.killPoints > 0) parts.push(`${table.killPoints} per kill`);
  return parts.join(" · ") || "No points";
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Admin input "10, 6, 5, 4" → [10, 6, 5, 4]. Blank = standard table ([]). Trailing zeros are dropped. */
export function parsePlacementPoints(input: unknown): ParseResult<number[]> {
  if (Array.isArray(input)) input = input.join(",");
  if (input === null || input === undefined) return { ok: true, value: [] };
  if (typeof input !== "string") return { ok: false, error: "Placement points must be a list of numbers." };
  const text = input.trim();
  if (!text) return { ok: true, value: [] };
  const parts = text.split(/[\s,]+/).filter(Boolean);
  const values = parts.map(Number);
  if (values.some((n) => !Number.isInteger(n) || n < 0 || n > MAX_POINTS)) {
    return { ok: false, error: `Placement points must be whole numbers from 0 to ${MAX_POINTS}, e.g. "10, 6, 5, 4, 3, 2, 1, 1".` };
  }
  if (values.length > MAX_PLACES) return { ok: false, error: `At most ${MAX_PLACES} places can score.` };
  for (let k = 1; k < values.length; k++) {
    if (values[k] > values[k - 1]) return { ok: false, error: "A lower place can't score more than a higher one." };
  }
  while (values.length && values[values.length - 1] === 0) values.pop();
  return { ok: true, value: values };
}

export function parseKillPoints(input: unknown): ParseResult<number> {
  if (input === null || input === undefined || input === "") return { ok: true, value: STANDARD_KILL_POINTS };
  const n = Number(input);
  if (!Number.isInteger(n) || n < 0 || n > 100) return { ok: false, error: "Points per kill must be a whole number from 0 to 100." };
  return { ok: true, value: n };
}

export function parseLobbyRounds(input: unknown): ParseResult<number> {
  if (input === null || input === undefined || input === "") return { ok: true, value: DEFAULT_LOBBY_ROUNDS };
  const n = Number(input);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LOBBY_ROUNDS) return { ok: false, error: `Rounds must be between 1 and ${MAX_LOBBY_ROUNDS}.` };
  return { ok: true, value: n };
}

// ----------------------------------------------------------- Round entry

export type RoundInputRow = { registrationId: string; placement: number | null; kills: number };

/**
 * Checks an organizer's results for one round: every row is a known
 * entry, placements are whole numbers 1..entries with no two entries
 * sharing a place, kills are 0..MAX_KILLS (and 0 for entries that didn't
 * play). At least one entry must have a placement.
 */
export function validateRoundResults(raw: unknown, entryIds: readonly string[]): ParseResult<RoundInputRow[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "Send a result for each entry." };
  const known = new Set(entryIds);
  const seen = new Set<string>();
  const places = new Map<number, number>();
  const rows: RoundInputRow[] = [];
  for (const item of raw) {
    const registrationId = typeof item?.registrationId === "string" ? item.registrationId : "";
    if (!known.has(registrationId)) return { ok: false, error: "A result is for an entry that isn't in this tournament." };
    if (seen.has(registrationId)) return { ok: false, error: "Each entry can only have one result per round." };
    seen.add(registrationId);
    const placement = item.placement === null || item.placement === undefined || item.placement === "" ? null : Number(item.placement);
    const kills = item.kills === null || item.kills === undefined || item.kills === "" ? 0 : Number(item.kills);
    if (placement !== null && (!Number.isInteger(placement) || placement < 1 || placement > entryIds.length)) {
      return { ok: false, error: `Placements must be between 1 and ${entryIds.length}.` };
    }
    if (!Number.isInteger(kills) || kills < 0 || kills > MAX_KILLS) return { ok: false, error: `Kills must be a whole number from 0 to ${MAX_KILLS}.` };
    if (placement === null && kills > 0) return { ok: false, error: "An entry without a placement (didn't play) can't have kills." };
    if (placement !== null) {
      if (places.has(placement)) return { ok: false, error: `Two entries can't both finish ${ordinal(placement)}.` };
      places.set(placement, 1);
    }
    rows.push({ registrationId, placement, kills });
  }
  for (const id of entryIds) if (!seen.has(id)) rows.push({ registrationId: id, placement: null, kills: 0 });
  if (places.size === 0) return { ok: false, error: "Enter at least one placement." };
  return { ok: true, value: rows };
}

// ----------------------------------------------------------- Leaderboard

export type ScoredResult = { roundNumber: number; registrationId: string; placement: number | null; kills: number };

export type LeaderboardRow = {
  registrationId: string;
  rank: number;
  total: number;
  placementTotal: number;
  kills: number;
  /** Rounds won (placement 1). */
  wins: number;
  played: number;
  /** Points per posted round, by round number. null = didn't play that round. */
  rounds: Record<number, { placement: number | null; kills: number; points: number } | undefined>;
};

/**
 * Standings from posted rounds. Ties break on rounds won, then placement
 * points, then kills, then the better place in the most recent round;
 * entries still level share a rank.
 */
export function buildLeaderboard(entryIds: readonly string[], results: readonly ScoredResult[], table: PointsTable): LeaderboardRow[] {
  const rows = new Map<string, LeaderboardRow>(
    entryIds.map((id) => [id, { registrationId: id, rank: 0, total: 0, placementTotal: 0, kills: 0, wins: 0, played: 0, rounds: {} }])
  );
  const roundNumbers = [...new Set(results.map((r) => r.roundNumber))].sort((a, b) => b - a);
  for (const r of results) {
    const row = rows.get(r.registrationId);
    if (!row) continue;
    const points = pointsFor(r.placement, r.kills, table);
    row.rounds[r.roundNumber] = { placement: r.placement, kills: r.kills, points };
    if (r.placement === null) continue;
    row.played++;
    row.total += points;
    row.placementTotal += placementPointsFor(r.placement, table);
    row.kills += r.kills;
    if (r.placement === 1) row.wins++;
  }
  const recentPlace = (row: LeaderboardRow) => {
    for (const n of roundNumbers) {
      const p = row.rounds[n]?.placement;
      if (p !== null && p !== undefined) return p;
    }
    return Number.POSITIVE_INFINITY;
  };
  const byPlace = (x: number, y: number) => (x === y ? 0 : x < y ? -1 : 1);
  const compare = (a: LeaderboardRow, b: LeaderboardRow) =>
    b.total - a.total || b.wins - a.wins || b.placementTotal - a.placementTotal || b.kills - a.kills || byPlace(recentPlace(a), recentPlace(b));
  const sorted = [...rows.values()].sort(compare);
  sorted.forEach((row, i) => {
    row.rank = i > 0 && compare(sorted[i - 1], row) === 0 ? sorted[i - 1].rank : i + 1;
  });
  return sorted;
}

/** The outright winner, or null if nothing's been played or first place is shared. */
export function leaderboardWinner(board: readonly LeaderboardRow[]): string | null {
  const [first, second] = board;
  if (!first || first.played === 0) return null;
  if (second && second.rank === first.rank) return null;
  return first.registrationId;
}

// ----------------------------------------------------------- Groups → final

export const MAX_LOBBY_GROUPS = 16;

export type LobbyGroupsConfig = { groups: number; qualifiers: number; finalRounds: number };

/** "A", "B", … for group 1, 2, … */
export function groupLetter(group: number): string {
  return String.fromCharCode(64 + group);
}

/**
 * Organizer settings for groups-then-a-final. Blank groups = one lobby
 * (null). The final must fit one lobby (groups × qualifiers ≤ lobby
 * size) and, at a full cap, each group has to hold more entries than
 * qualify from it.
 */
export function parseLobbyGroups(
  input: { groups?: unknown; qualifiers?: unknown; finalRounds?: unknown },
  lobbyCapacity: number | null,
  participantCap: number
): ParseResult<LobbyGroupsConfig | null> {
  if (input.groups === undefined || input.groups === null || input.groups === "" || Number(input.groups) === 0) return { ok: true, value: null };
  const groups = Number(input.groups);
  const qualifiers = Number(input.qualifiers);
  const finalRounds = input.finalRounds === undefined || input.finalRounds === "" ? DEFAULT_LOBBY_ROUNDS : Number(input.finalRounds);
  if (!Number.isInteger(groups) || groups < 2 || groups > MAX_LOBBY_GROUPS) return { ok: false, error: `Groups must be between 2 and ${MAX_LOBBY_GROUPS}.` };
  if (!Number.isInteger(qualifiers) || qualifiers < 1) return { ok: false, error: "Set how many from each group go to the final." };
  if (!Number.isInteger(finalRounds) || finalRounds < 1 || finalRounds > MAX_LOBBY_ROUNDS) return { ok: false, error: `Final rounds must be between 1 and ${MAX_LOBBY_ROUNDS}.` };
  if (lobbyCapacity !== null && groups * qualifiers > lobbyCapacity) {
    return { ok: false, error: `${groups} groups × ${qualifiers} qualifiers is ${groups * qualifiers} finalists. One lobby holds ${lobbyCapacity}.` };
  }
  if (groups * qualifiers < 2) return { ok: false, error: "The final needs at least 2 entries." };
  if (Math.floor(participantCap / groups) <= qualifiers) {
    return { ok: false, error: `With a cap of ${participantCap}, each of ${groups} groups would have ${Math.floor(participantCap / groups)} entries. Fewer than ${qualifiers + 1}, so nobody would be knocked out.` };
  }
  if (lobbyCapacity !== null && participantCap > groups * lobbyCapacity) {
    return { ok: false, error: `${groups} lobbies hold ${groups * lobbyCapacity} entries. Lower the cap or add groups.` };
  }
  return { ok: true, value: { groups, qualifiers, finalRounds } };
}

/**
 * How many groups to actually run with this many confirmed entries: as
 * configured, unless too few registered for every group to knock someone
 * out — then fewer groups, or 1 (play as a single lobby).
 */
export function effectiveGroups(entries: number, config: LobbyGroupsConfig): number {
  let g = config.groups;
  while (g >= 2 && Math.floor(entries / g) <= config.qualifiers) g--;
  return g >= 2 ? g : 1;
}

/** Deals (already shuffled) entries into `groups` groups as evenly as possible: 1-based group per id. */
export function dealGroups(ids: readonly string[], groups: number): Map<string, number> {
  return new Map(ids.map((id, i) => [id, (i % groups) + 1]));
}

/**
 * The top `count` of a group's leaderboard. Null if the qualification
 * line falls inside a tie that no tiebreak separates (the organizer must
 * check those results before the final can start).
 */
export function qualifiersFrom(board: readonly LeaderboardRow[], count: number): string[] | null {
  if (board.length <= count) return board.map((r) => r.registrationId);
  const lastIn = board[count - 1];
  const firstOut = board[count];
  if (lastIn.rank === firstOut.rank) return null;
  return board.slice(0, count).map((r) => r.registrationId);
}
