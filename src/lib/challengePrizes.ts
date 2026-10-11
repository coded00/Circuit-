/**
 * Circuit — prize categories for a Daily Challenge, and how a finished challenge pays them
 * (docs/daily-challenges-spec.md §11). Pure functions, no database, so the rules that decide who is paid and how much
 * can be tested to the kobo.
 *
 * A challenge can pay several prizes for different achievements at once. Each prize category has a fixed amount and a
 * rule from a small closed set — never free-form, so a winner is always something the server can compute:
 *
 *   - It ranks qualified entries by a metric (the challenge's ranked score, or one of its number-targets) and pays the
 *     entry at a given place. Entries level on the metric share that place's prize equally.
 *   - It can require conditions — a "win the match" that only this category cares about (a requirement that isn't a gate
 *     for the whole challenge).
 *   - A COMBINED category is paid to the player who wins every category it names, and replaces those prizes for that
 *     player: they receive the combined amount, not the separate ones as well.
 *
 * The house keeps everything that is not awarded: a category nobody qualified for, a prize replaced by a combined one,
 * and the whole pool when nobody qualifies. Nothing here decides who is *qualified* — that is staff's review (every
 * gate requirement met, the minimum score reached); this module is handed only qualified entries.
 */

import type { ScoreDirection } from "@prisma/client";
import { MAX_KOBO_COLUMN } from "@/lib/money";
import { rankEntries, type RankInput } from "@/lib/dailyChallenges";
import type { FinishGroup } from "@/lib/prizes";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_PRIZE_CATEGORIES = 8;
export const MAX_CATEGORY_NAME_LENGTH = 60;
export const MAX_CATEGORY_PLACE = 8;

export type PrizeCategoryInput = {
  /** Stable within one challenge: a database id once saved, or any unique string while the form is being edited. */
  key: string;
  name: string;
  /** Kobo, fixed. */
  amount: number;
  /** The number-target (by requirement key) the category ranks by; null = the challenge's ranked score. */
  metricKey: string | null;
  /** Which place pays: 1 = the best entry. Ignored by a combined category. */
  place: number;
  /** Requirement keys that must all be met for an entry to be considered for this category. */
  requires: string[];
  /** Combined category: keys of the categories whose winner must be the same player. Empty for an ordinary category. */
  comboOf: string[];
};

export type PrizeContext = {
  /** Every requirement of the challenge, by key. */
  requirementKeys: ReadonlySet<string>;
  /** The ones that are number-targets, which are the only ones a category can rank by. */
  targetKeys: ReadonlySet<string>;
};

// ---------------------------------------------------------------------------------------------------------
// Parsing and validating what an admin configures
// ---------------------------------------------------------------------------------------------------------

export function parsePrizeCategories(raw: unknown, ctx: PrizeContext): Result<PrizeCategoryInput[]> {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Prize categories must be a list." };
  if (raw.length > MAX_PRIZE_CATEGORIES) return { ok: false, error: `A challenge can have at most ${MAX_PRIZE_CATEGORIES} prize categories.` };

  const out: PrizeCategoryInput[] = [];
  const names = new Set<string>();
  const keys = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const n = i + 1;
    if (!item || typeof item !== "object") return { ok: false, error: `Prize category ${n} isn't valid.` };
    const r = item as Record<string, unknown>;

    const key = typeof r.key === "string" && r.key.trim() ? r.key.trim() : `cat-${i}`;
    if (keys.has(key)) return { ok: false, error: "Two prize categories share an id." };
    keys.add(key);

    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name) return { ok: false, error: `Prize category ${n} needs a name.` };
    if (name.length > MAX_CATEGORY_NAME_LENGTH) return { ok: false, error: `Prize category ${n}'s name can be at most ${MAX_CATEGORY_NAME_LENGTH} characters.` };
    if (names.has(name.toLowerCase())) return { ok: false, error: `"${name}" is listed twice.` };
    names.add(name.toLowerCase());

    const amountRaw = typeof r.amount === "string" && r.amount.trim() !== "" ? Number(r.amount) : r.amount;
    if (typeof amountRaw !== "number" || !Number.isInteger(amountRaw) || amountRaw <= 0 || amountRaw > MAX_KOBO_COLUMN) {
      return { ok: false, error: `"${name}" needs a prize amount in whole kobo, more than zero.` };
    }

    const metricKey = r.metricKey === undefined || r.metricKey === null || r.metricKey === "" ? null : String(r.metricKey);
    if (metricKey !== null && !ctx.targetKeys.has(metricKey)) return { ok: false, error: `"${name}" ranks by something that isn't a number target of this challenge.` };

    const placeRaw = r.place === undefined || r.place === null || r.place === "" ? 1 : typeof r.place === "string" ? Number(r.place) : r.place;
    if (typeof placeRaw !== "number" || !Number.isInteger(placeRaw) || placeRaw < 1 || placeRaw > MAX_CATEGORY_PLACE) {
      return { ok: false, error: `"${name}": the place must be a whole number from 1 to ${MAX_CATEGORY_PLACE}.` };
    }

    const requires = Array.isArray(r.requires) ? r.requires.map(String) : [];
    for (const k of requires) if (!ctx.requirementKeys.has(k)) return { ok: false, error: `"${name}" requires something that isn't a requirement of this challenge.` };
    if (new Set(requires).size !== requires.length) return { ok: false, error: `"${name}" lists the same requirement twice.` };

    const comboOf = Array.isArray(r.comboOf) ? r.comboOf.map(String) : [];
    out.push({ key, name, amount: amountRaw, metricKey, place: comboOf.length > 0 ? 1 : placeRaw, requires, comboOf });
  }

  // Combined categories are checked once every key is known.
  const byKey = new Map(out.map((c) => [c.key, c]));
  const used = new Set<string>();
  for (const c of out) {
    if (c.comboOf.length === 0) continue;
    if (c.comboOf.length < 2) return { ok: false, error: `"${c.name}" is a combined prize, so it needs at least two categories to combine.` };
    if (new Set(c.comboOf).size !== c.comboOf.length) return { ok: false, error: `"${c.name}" lists the same category twice.` };
    if (c.metricKey !== null || c.requires.length > 0) return { ok: false, error: `"${c.name}" is paid to the winner of the categories it combines, so it can't have its own metric or requirements.` };
    for (const k of c.comboOf) {
      const part = byKey.get(k);
      if (!part) return { ok: false, error: `"${c.name}" combines a category that doesn't exist.` };
      if (part.comboOf.length > 0) return { ok: false, error: `"${c.name}" can't combine another combined prize.` };
      if (k === c.key) return { ok: false, error: `"${c.name}" can't combine itself.` };
      if (used.has(k)) return { ok: false, error: `"${part.name}" is already part of another combined prize.` };
      used.add(k);
    }
  }
  return { ok: true, value: out };
}

/**
 * The most a challenge could pay out. The plain sum of every category — deliberately simple and conservative: a
 * combined prize replaces the ones it combines for a player, so the real maximum is never higher, and it keeps the
 * funding check something an admin can add up in their head.
 */
export function worstCasePayout(categories: readonly Pick<PrizeCategoryInput, "amount">[]): number {
  return categories.reduce((sum, c) => sum + c.amount, 0);
}

/**
 * The funding rule, checked before a challenge can be published. The prizes at their worst have to fit inside what the
 * smallest field that can run would pay in — scaled by the payout cap, so the house keeps a margin even then — plus
 * whatever a sponsor has put up. Returns the reason it fails, or null. No categories = nothing to check here (the older
 * rank-split model has its own rule).
 */
export function prizeFundingError(opts: {
  categories: readonly Pick<PrizeCategoryInput, "amount">[];
  entryFee: number;
  minEntrants: number;
  maxPayoutBps: number;
  sponsorKobo: number;
}): string | null {
  if (opts.categories.length === 0) return null;
  const worst = worstCasePayout(opts.categories);
  const fromEntries = Math.floor((opts.entryFee * opts.minEntrants * opts.maxPayoutBps) / 10_000);
  const allowed = fromEntries + Math.max(0, opts.sponsorKobo);
  if (worst > allowed) {
    const naira = (k: number) => `₦${(k / 100).toLocaleString("en-NG")}`;
    return `The prizes add up to ${naira(worst)}, but at the minimum of ${opts.minEntrants} players the most this challenge can pay is ${naira(allowed)} (${opts.maxPayoutBps / 100}% of the entries${opts.sponsorKobo > 0 ? `, plus the ${naira(opts.sponsorKobo)} sponsor` : ""}). Lower a prize or raise the minimum number of players.`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Settlement: who gets what
// ---------------------------------------------------------------------------------------------------------

/** A qualified entry: verified, every gate met, minimum reached. The caller filters; this module trusts it. */
export type SettleEntry = {
  userId: string;
  /** The verified ranked score. */
  score: number;
  tiebreakScore: number | null;
  /** Verified values of the number-targets, by requirement key. */
  targets: Record<string, number>;
  /** Staff's verdict on each requirement, by key. */
  met: Record<string, boolean>;
};

export type Award = { categoryKey: string; userId: string; amount: number };

export type SettleResult = {
  awards: Award[];
  /** Per category: what it could pay, what it did pay, and what stays with the house. */
  categories: { key: string; amount: number; awarded: number; unawarded: number }[];
  awarded: number;
};

/** The winners of one place among ranked groups: the group whose positions cover it (level entries occupy several places). */
function winnersAtPlace(groups: readonly FinishGroup[], place: number): string[] {
  let position = 1;
  for (const g of groups) {
    const size = g.userIds.length;
    if (place >= position && place < position + size) return [...g.userIds].sort();
    position += size;
  }
  return [];
}

/** Splits a prize equally; the odd kobo goes to the first by id, so the shares always add up to the prize exactly. */
function splitEqually(amount: number, userIds: readonly string[]): { userId: string; amount: number }[] {
  if (userIds.length === 0) return [];
  const sorted = [...userIds].sort();
  const each = Math.floor(amount / sorted.length);
  const shares = sorted.map((userId) => ({ userId, amount: each }));
  shares[0].amount += amount - each * sorted.length;
  return shares;
}

/** Who is considered for a category and how they rank, best first, with entries level on the metric in one group. */
export function rankCategoryEntries(
  c: Pick<PrizeCategoryInput, "metricKey" | "requires">,
  entries: readonly SettleEntry[],
  opts: { direction: ScoreDirection; tiebreakDirection: ScoreDirection | null; targetDirections: Readonly<Record<string, ScoreDirection>> },
): FinishGroup[] {
  const eligible = entries.filter((e) => c.requires.every((k) => e.met[k] === true));
  if (c.metricKey === null) {
    return rankEntries(
      eligible.map((e) => ({ userId: e.userId, score: e.score, tiebreakScore: e.tiebreakScore })),
      { direction: opts.direction, tiebreakDirection: opts.tiebreakDirection },
    );
  }
  const key = c.metricKey;
  // An entry with no verified number for the metric can't be ranked by it. The ranked score breaks ties.
  const ranked: RankInput[] = eligible.filter((e) => typeof e.targets[key] === "number").map((e) => ({ userId: e.userId, score: e.targets[key], tiebreakScore: e.score }));
  return rankEntries(ranked, { direction: opts.targetDirections[key] ?? "HIGHER", tiebreakDirection: opts.direction });
}

export function settleCategories(opts: {
  categories: readonly PrizeCategoryInput[];
  entries: readonly SettleEntry[];
  direction: ScoreDirection;
  tiebreakDirection: ScoreDirection | null;
  /** Direction of each number-target, by requirement key: HIGHER = more is better. */
  targetDirections: Readonly<Record<string, ScoreDirection>>;
}): SettleResult {
  const { categories, entries } = opts;
  const ordinary = categories.filter((c) => c.comboOf.length === 0);
  const combined = categories.filter((c) => c.comboOf.length > 0);

  // Each ordinary category: who is eligible, how they rank, and who holds its place.
  const winnersByCategory = new Map<string, string[]>();
  for (const c of ordinary) {
    winnersByCategory.set(c.key, winnersAtPlace(rankCategoryEntries(c, entries, opts), c.place));
  }

  // A combined prize goes to whoever wins every category it names, and replaces those prizes for that player.
  const superseded = new Map<string, Set<string>>(); // categoryKey → players whose separate prize is replaced
  const comboWinners = new Map<string, string[]>();
  for (const k of combined) {
    const sets = k.comboOf.map((key) => new Set(winnersByCategory.get(key) ?? []));
    const both = [...sets[0]].filter((u) => sets.every((s) => s.has(u))).sort();
    comboWinners.set(k.key, both);
    for (const key of k.comboOf) {
      const set = superseded.get(key) ?? new Set<string>();
      for (const u of both) set.add(u);
      superseded.set(key, set);
    }
  }

  const awards: Award[] = [];
  const perCategory = new Map<string, number>();
  const pay = (categoryKey: string, shares: { userId: string; amount: number }[]) => {
    for (const s of shares) {
      if (s.amount <= 0) continue;
      awards.push({ categoryKey, userId: s.userId, amount: s.amount });
      perCategory.set(categoryKey, (perCategory.get(categoryKey) ?? 0) + s.amount);
    }
  };

  for (const c of ordinary) {
    const winners = winnersByCategory.get(c.key) ?? [];
    // The prize is split among everyone level for the place first, and only then does a combined prize remove a
    // player's share — so a replaced share goes to the house, never to someone else.
    const replaced = superseded.get(c.key) ?? new Set<string>();
    pay(c.key, splitEqually(c.amount, winners).filter((s) => !replaced.has(s.userId)));
  }
  for (const k of combined) pay(k.key, splitEqually(k.amount, comboWinners.get(k.key) ?? []));

  awards.sort((a, b) => a.categoryKey.localeCompare(b.categoryKey) || a.userId.localeCompare(b.userId));
  const awarded = awards.reduce((sum, a) => sum + a.amount, 0);
  return {
    awards,
    categories: categories.map((c) => {
      const paid = perCategory.get(c.key) ?? 0;
      return { key: c.key, amount: c.amount, awarded: paid, unawarded: c.amount - paid };
    }),
    awarded,
  };
}

/** What the house keeps: everything collected that was not awarded. Never negative — the funding rule keeps awards inside the pool. */
export function houseTake(gross: number, awarded: number): number {
  return Math.max(0, gross - awarded);
}

// ---------------------------------------------------------------------------------------------------------
// The minimum score, and what needs a recording
// ---------------------------------------------------------------------------------------------------------

/** Has a verified score reached the challenge's minimum? No minimum = anyone qualifies on score. */
export function meetsMinimumScore(opts: { minScore: number | null; direction: ScoreDirection; score: number }): boolean {
  if (opts.minScore === null) return true;
  return opts.direction === "HIGHER" ? opts.score >= opts.minScore : opts.score <= opts.minScore;
}

/**
 * Whether a challenge is allowed to rely on evidence it can't get from a scoreboard. A weapon challenge, a ranked score
 * flagged as not on the scoreboard, or a prize category that ranks by (or requires) a stat flagged the same way all need
 * a screen recording — the only thing a reviewer can check a weapon kill or a headshot against. Returns the reason it
 * can't be published, or null.
 */
export function recordingRefusal(opts: {
  kind: "STANDARD" | "WEAPON" | "SKILL" | "COMBINED";
  scoreNeedsRecording: boolean;
  requireRecording: boolean;
  categories: readonly Pick<PrizeCategoryInput, "name" | "metricKey" | "requires">[];
  /** Requirement keys whose stat can't be read off a scoreboard. */
  recordingStatKeys: ReadonlySet<string>;
}): string | null {
  if (opts.requireRecording) return null;
  if (opts.kind === "WEAPON") return "A weapon challenge is checked against a screen recording. Turn on the recording requirement.";
  if (opts.scoreNeedsRecording) return "The ranked score isn't shown on the scoreboard, so it can only be checked from a screen recording. Turn on the recording requirement.";
  for (const c of opts.categories) {
    if ((c.metricKey && opts.recordingStatKeys.has(c.metricKey)) || c.requires.some((k) => opts.recordingStatKeys.has(k))) {
      return `"${c.name}" depends on a stat that can't be read off the scoreboard, so it needs a screen recording. Turn on the recording requirement.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Publishing: the checks that need the categories
// ---------------------------------------------------------------------------------------------------------

/**
 * Everything about a challenge's prizes and evidence that has to hold before it can be published. Run alongside
 * `publishRefusal` (dates, the platform switch). A challenge with no categories still has the recording rule, and a
 * weapon challenge still has to name its weapon.
 */
export function categoryPublishRefusal(opts: {
  kind: "STANDARD" | "WEAPON" | "SKILL" | "COMBINED";
  weaponLabel: string | null;
  scoreNeedsRecording: boolean;
  requireRecording: boolean;
  /** The older rank split. A challenge uses it or prize categories, never both. */
  prizeSplit: readonly number[];
  categories: readonly PrizeCategoryInput[];
  recordingStatKeys: ReadonlySet<string>;
  entryFee: number;
  minEntrants: number;
  maxPayoutBps: number;
  sponsorKobo: number;
}): string | null {
  if (opts.kind === "WEAPON" && !opts.weaponLabel?.trim()) return "Say which weapon this challenge is about.";
  const recording = recordingRefusal({
    kind: opts.kind,
    scoreNeedsRecording: opts.scoreNeedsRecording,
    requireRecording: opts.requireRecording,
    categories: opts.categories,
    recordingStatKeys: opts.recordingStatKeys,
  });
  if (recording) return recording;
  if (opts.categories.length === 0) return null;
  if (opts.prizeSplit.length > 0) return "Use either a rank split or prize categories, not both. Clear the rank split.";
  return prizeFundingError({ categories: opts.categories, entryFee: opts.entryFee, minEntrants: opts.minEntrants, maxPayoutBps: opts.maxPayoutBps, sponsorKobo: opts.sponsorKobo });
}
