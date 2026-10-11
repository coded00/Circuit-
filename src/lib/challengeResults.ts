/**
 * Circuit — what a finished Daily Challenge shows and pays (docs/daily-challenges-spec.md §11). Pure functions, no
 * database: given the qualified entries and the challenge's rules, this says who is where on every leaderboard and, for
 * settlement, exactly what is awarded, what the house keeps, what is refunded — and proves the books balance.
 *
 * Two prize models are supported because both exist: a challenge with prize categories pays fixed amounts and the house
 * keeps the rest; an older one splits a pool by rank (percentages of what entries brought in, after the platform's cut,
 * plus any sponsor). A challenge with no categories keeps working exactly as before.
 *
 * Who is *qualified* — verified, every gate requirement met, the minimum score reached — is staff's review and has already
 * happened; everything here is handed only qualified entries.
 */

import type { ScoreDirection } from "@prisma/client";
import { rankEntries } from "@/lib/dailyChallenges";
import { prizeShares } from "@/lib/prizes";
import { rankCategoryEntries, settleCategories, type Award, type PrizeCategoryInput, type SettleEntry } from "@/lib/challengePrizes";

export type RankingRules = {
  direction: ScoreDirection;
  tiebreakDirection: ScoreDirection | null;
  /** Direction of each number-target, by requirement key. */
  targetDirections: Readonly<Record<string, ScoreDirection>>;
};

// ---------------------------------------------------------------------------------------------------------
// Leaderboards
// ---------------------------------------------------------------------------------------------------------

export type BoardRow = {
  userId: string;
  /** 1 = best. Entries level on the metric share a rank, and the next rank skips (1, 1, 3). */
  rank: number;
  /** The number this board ranks by. */
  value: number;
  /** Holds a prize on this board. */
  winner: boolean;
  /** Kobo this player gets from this board (the whole challenge, for the overall board). */
  prize: number;
};

export type CategoryBoard = { key: string; name: string; amount: number; combined: boolean; rows: BoardRow[] };

export type Boards = { overall: BoardRow[]; categories: CategoryBoard[] };

type Group = { userIds: string[] };

/** Flattens ranked groups into rows with competition-style ranks. */
function toRows(groups: readonly Group[], valueOf: (userId: string) => number, prizeOf: (userId: string) => number): BoardRow[] {
  const rows: BoardRow[] = [];
  let position = 1;
  for (const g of groups) {
    for (const userId of [...g.userIds].sort()) {
      const prize = prizeOf(userId);
      rows.push({ userId, rank: position, value: valueOf(userId), winner: prize > 0, prize });
    }
    position += g.userIds.length;
  }
  return rows;
}

/**
 * Every leaderboard for a challenge: the overall board by the ranked score, and one per prize category showing who is
 * eligible for it, how they rank by its metric, and who holds the prize. `awards` is what settlement would pay (or did).
 */
export function buildBoards(opts: { categories: readonly PrizeCategoryInput[]; entries: readonly SettleEntry[]; rules: RankingRules; awards: readonly Award[] }): Boards {
  const { entries, rules, awards } = opts;
  const byUser = new Map(entries.map((e) => [e.userId, e]));
  const totalFor = (userId: string) => awards.filter((a) => a.userId === userId).reduce((s, a) => s + a.amount, 0);

  const overallGroups = rankEntries(entries.map((e) => ({ userId: e.userId, score: e.score, tiebreakScore: e.tiebreakScore })), { direction: rules.direction, tiebreakDirection: rules.tiebreakDirection });
  const overall = toRows(overallGroups, (u) => byUser.get(u)?.score ?? 0, totalFor);

  const categories: CategoryBoard[] = opts.categories.map((c) => {
    const forCategory = (userId: string) => awards.filter((a) => a.categoryKey === c.key && a.userId === userId).reduce((s, a) => s + a.amount, 0);
    if (c.comboOf.length > 0) {
      // A combined prize has no ranking of its own: it is held by whoever won every category it combines.
      const holders = awards.filter((a) => a.categoryKey === c.key).map((a) => a.userId);
      const rows = toRows([{ userIds: [...new Set(holders)] }], (u) => byUser.get(u)?.score ?? 0, forCategory);
      return { key: c.key, name: c.name, amount: c.amount, combined: true, rows: holders.length ? rows : [] };
    }
    const groups = rankCategoryEntries(c, entries, rules);
    const valueOf = (u: string) => (c.metricKey === null ? (byUser.get(u)?.score ?? 0) : (byUser.get(u)?.targets[c.metricKey] ?? 0));
    return { key: c.key, name: c.name, amount: c.amount, combined: false, rows: toRows(groups, valueOf, forCategory) };
  });

  return { overall, categories };
}

// ---------------------------------------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------------------------------------

export type SettlementInput = {
  mode: "CATEGORIES" | "RANK_SPLIT";
  categories: readonly PrizeCategoryInput[];
  /** Percentages by place, for the older rank-split model. Empty = winner takes all. */
  split: readonly number[];
  entries: readonly SettleEntry[];
  rules: RankingRules;
  /** Net entry money held for this challenge, in kobo: every fee taken less every fee returned. */
  collected: number;
  /** Platform fees already booked as revenue when entries were taken (the older model), net of any returned. */
  platformFeesBooked: number;
  /** The sponsor's declared top-up. Platform money: it can cover a shortfall but is never the house's to keep. */
  sponsor: number;
  noWinnerPolicy: "HOUSE_KEEPS" | "REFUND_ENTRIES";
  approval: { autoApprove: boolean; autoApproveMaxKobo: number };
};

export type SettlementPlan =
  | {
      ok: true;
      awards: Award[];
      awarded: number;
      /** Nobody qualified and the policy is to give the money back: every entry fee is refunded and nothing else moves. */
      refundAll: boolean;
      /** What is booked to the house at settlement. */
      houseToBook: number;
      /** What the sponsor's money covered beyond the entries. */
      sponsorUsed: number;
      /** A named person has to approve before money moves. */
      requiresApproval: boolean;
    }
  | { ok: false; error: string };

export function planSettlement(input: SettlementInput): SettlementPlan {
  const entryMoney = input.collected - input.platformFeesBooked;
  let awards: Award[];

  if (input.mode === "CATEGORIES") {
    awards = settleCategories({ categories: input.categories, entries: input.entries, direction: input.rules.direction, tiebreakDirection: input.rules.tiebreakDirection, targetDirections: input.rules.targetDirections }).awards;
  } else {
    // Rank split: the pool is what the entries brought in after the platform's cut, plus the sponsor.
    const pool = entryMoney + input.sponsor;
    const groups = rankEntries(input.entries.map((e) => ({ userId: e.userId, score: e.score, tiebreakScore: e.tiebreakScore })), { direction: input.rules.direction, tiebreakDirection: input.rules.tiebreakDirection });
    awards = prizeShares(Math.max(0, pool), input.split, groups).map((s) => ({ categoryKey: `place-${s.place}`, userId: s.userId, amount: s.amount }));
  }

  const awarded = awards.reduce((sum, a) => sum + a.amount, 0);
  const funded = entryMoney + input.sponsor;
  if (awarded > funded) {
    return { ok: false, error: `The prizes (${awarded} kobo) are more than this challenge has to pay them with (${funded} kobo). Nothing has been paid.` };
  }

  if (awards.length === 0 && input.noWinnerPolicy === "REFUND_ENTRIES") {
    return { ok: true, awards: [], awarded: 0, refundAll: true, houseToBook: 0, sponsorUsed: 0, requiresApproval: false };
  }

  const sponsorUsed = Math.max(0, awarded - entryMoney);
  const houseToBook = entryMoney - awarded + sponsorUsed;
  const requiresApproval = input.sponsor > 0 || !input.approval.autoApprove || awarded > input.approval.autoApproveMaxKobo;
  return { ok: true, awards, awarded, refundAll: false, houseToBook, sponsorUsed, requiresApproval };
}

/**
 * The books for one challenge must balance to the kobo before anything is final: money taken in and the sponsor's cover on
 * one side; prizes, refunds, the platform's booked cut and the house's take on the other. Returns what is wrong, or null.
 */
export function reconcileBooks(opts: { collected: number; sponsorUsed: number; awarded: number; refunded: number; houseToBook: number; platformFeesBooked: number }): string | null {
  const inflow = opts.collected + opts.sponsorUsed;
  const outflow = opts.awarded + opts.refunded + opts.houseToBook + opts.platformFeesBooked;
  if (inflow !== outflow) return `The books don't balance: ${inflow} in, ${outflow} out (prizes ${opts.awarded}, refunds ${opts.refunded}, house ${opts.houseToBook}, platform fees ${opts.platformFeesBooked}).`;
  if ([opts.collected, opts.sponsorUsed, opts.awarded, opts.refunded, opts.houseToBook, opts.platformFeesBooked].some((n) => n < 0 || !Number.isInteger(n))) return "A settlement figure is negative or not a whole number of kobo.";
  return null;
}

/** A one-line account of a settlement, for the admin page and the audit log. */
export function describeSettlement(plan: Extract<SettlementPlan, { ok: true }>): string {
  const naira = (k: number) => `₦${(k / 100).toLocaleString("en-NG")}`;
  if (plan.refundAll) return "Nobody qualified. Every entry fee is refunded.";
  if (plan.awards.length === 0) return `Nobody qualified. The house keeps ${naira(plan.houseToBook)}.`;
  return `${plan.awards.length} prize${plan.awards.length === 1 ? "" : "s"} totalling ${naira(plan.awarded)}; the house keeps ${naira(plan.houseToBook)}.`;
}
