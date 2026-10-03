/**
 * Circuit — split prizes: how a tournament's prize pool is shared across
 * finishing places. Pure functions (no database), safe in client
 * components and unit-tested in prizes.test.ts. Who finished where comes
 * from src/lib/prizePlaces.ts.
 *
 * The organizer sets a percentage per place before anyone pays (presets
 * or custom), stored as Tournament.prizeSplit; empty = winner takes all.
 * Entries level on a place split the combined share of the places they
 * occupy — e.g. a knockout without a 3rd-place match has two semi-final
 * losers sharing 3rd. Each place claims its own share through the payout
 * route. Kobo that don't divide evenly go to the champion.
 */

export type PrizePreset = { id: string; label: string; split: number[] };

export const PRIZE_PRESETS: readonly PrizePreset[] = [
  { id: "wta", label: "Winner takes all", split: [100] },
  { id: "60-40", label: "60 / 40", split: [60, 40] },
  { id: "70-20-10", label: "70 / 20 / 10", split: [70, 20, 10] },
  { id: "50-30-20", label: "50 / 30 / 20", split: [50, 30, 20] },
];

/**
 * Most paid places: a knockout ranks only 1st, 2nd and a shared 3rd, a
 * double elimination 1st to 3rd; a lobby with groups ranks only its
 * finalists.
 */
export function maxPrizePlaces(structure: string, participantCap: number, finalists: number | null = null): number {
  const cap = Math.max(2, participantCap);
  if (structure === "KNOCKOUT") return cap >= 4 ? 3 : 2;
  // Double elimination ranks champion, grand-final runner-up and losers' final loser.
  if (structure === "DOUBLE_ELIMINATION") return cap >= 3 ? 3 : 2;
  return Math.min(8, cap, finalists ?? cap);
}

/** [] and [100] both mean winner takes all. */
export function normalizeSplit(split: readonly number[]): number[] {
  return split.length === 1 && split[0] === 100 ? [] : [...split];
}

export function effectiveSplit(split: readonly number[]): number[] {
  return split.length === 0 ? [100] : [...split];
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Organizer input — an array or "50, 30, 20" — checked against the structure's places. */
export function parsePrizeSplit(input: unknown, maxPlaces: number): Result<number[]> {
  // Nothing chosen (including the empty list the forms send with no cash prize) = winner takes all.
  if (input === null || input === undefined || input === "" || (Array.isArray(input) && input.length === 0)) return { ok: true, value: [] };
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[\s,/]+/).filter(Boolean) : null;
  if (!raw) return { ok: false, error: "The prize split must be a list of percentages." };
  if (raw.length === 0) return { ok: true, value: [] };
  const values = raw.map(Number);
  if (values.some((n) => !Number.isInteger(n) || n < 1 || n > 100)) return { ok: false, error: "Each place's share must be a whole percentage from 1 to 100." };
  if (values.length > maxPlaces) {
    return { ok: false, error: `This tournament can pay at most ${maxPlaces} place${maxPlaces === 1 ? "" : "s"}.` };
  }
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) return { ok: false, error: "A lower place can't get a bigger share than a higher one." };
  }
  const total = values.reduce((a, b) => a + b, 0);
  if (total !== 100) return { ok: false, error: `The shares add up to ${total}%. They need to make 100%.` };
  return { ok: true, value: normalizeSplit(values) };
}

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
export { ordinal as placeLabel };

/** "Winner takes all" / "1st 60% · 2nd 40%". */
export function describeSplit(split: readonly number[]): string {
  const s = effectiveSplit(split);
  if (s.length === 1) return "Winner takes all";
  return s.map((pct, i) => `${ordinal(i + 1)} ${pct}%`).join(" · ");
}

/** Planned amount per place (before any ties), for the Prizes tab. */
export function plannedShares(prizeAmount: number, split: readonly number[]): { place: number; percent: number; amount: number }[] {
  const s = effectiveSplit(split);
  const rows = s.map((percent, i) => ({ place: i + 1, percent, amount: Math.floor((prizeAmount * percent) / 100) }));
  const remainder = prizeAmount - rows.reduce((a, r) => a + r.amount, 0);
  if (rows[0]) rows[0].amount += remainder;
  return rows;
}

export type FinishGroup = { userIds: string[] };

export type PrizeShare = {
  userId: string;
  /** The first place the entry's group occupies (1 = champion). */
  place: number;
  /** How many entries share this place. */
  sharedWith: number;
  amount: number;
};

/**
 * Turns finishing groups (in order; entries level on a place together)
 * into prize shares. A group of k starting at place p shares the percent
 * of places p..p+k-1 equally. Places past the split pay nothing.
 */
export function prizeShares(prizeAmount: number, split: readonly number[], groups: readonly FinishGroup[]): PrizeShare[] {
  const s = effectiveSplit(split);
  const shares: PrizeShare[] = [];
  let place = 1;
  for (const group of groups) {
    const k = group.userIds.length;
    if (k === 0) continue;
    if (place > s.length) break;
    const percent = s.slice(place - 1, place - 1 + k).reduce((a, b) => a + b, 0);
    const each = Math.floor((prizeAmount * percent) / 100 / k);
    for (const userId of group.userIds) if (each > 0) shares.push({ userId, place, sharedWith: k, amount: each });
    place += k;
  }
  const paid = shares.reduce((a, r) => a + r.amount, 0);
  const plannedTotal = Math.floor((prizeAmount * s.reduce((a, b) => a + b, 0)) / 100);
  if (shares[0] && plannedTotal > paid) shares[0].amount += Math.min(plannedTotal - paid, prizeAmount - paid);
  return shares;
}

/**
 * "Not yet claimed" / "Sent" / "Processing" / "2 of 3 places paid · 1 processing" — for organizer and admin views.
 * A team's place is claimed by each of its players, so a place counts as paid once everyone who
 * has claimed it is paid; with a single place and several claimants it reads "2 players paid".
 */
export function prizePayoutSummary(txns: readonly { type: string; status: string; place?: number | null }[], split: readonly number[]): string {
  const payouts = txns.filter((t) => t.type === "PRIZE_PAYOUT" && t.status !== "FAILED");
  if (payouts.length === 0) return "Not yet claimed";
  const places = effectiveSplit(split).length;
  if (places === 1) {
    const sent = payouts.filter((t) => t.status === "COMPLETE").length;
    const processing = payouts.length - sent;
    if (payouts.length === 1) return sent ? "Sent" : "Processing";
    return `${sent} player${sent === 1 ? "" : "s"} paid${processing ? ` · ${processing} processing` : ""}`;
  }
  const byPlace = new Map<number, { type: string; status: string }[]>();
  for (const t of payouts) byPlace.set(t.place ?? 1, [...(byPlace.get(t.place ?? 1) ?? []), t]);
  const sentPlaces = [...byPlace.values()].filter((rows) => rows.every((r) => r.status === "COMPLETE")).length;
  const processingPlaces = byPlace.size - sentPlaces;
  return `${sentPlaces} of ${places} places paid${processingPlaces ? ` · ${processingPlaces} processing` : ""}`;
}
