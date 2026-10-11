import { describe, expect, it } from "vitest";
import { buildBoards, describeSettlement, planSettlement, reconcileBooks, type RankingRules, type SettlementInput } from "@/lib/challengeResults";
import { settleCategories, type PrizeCategoryInput, type SettleEntry } from "@/lib/challengePrizes";

const NAIRA = 100;
const rules: RankingRules = { direction: "HIGHER", tiebreakDirection: null, targetDirections: { ak: "HIGHER" } };
const entry = (userId: string, score: number, over: Partial<SettleEntry> = {}): SettleEntry => ({ userId, score, tiebreakScore: null, targets: {}, met: {}, ...over });
const cat = (key: string, amount: number, over: Partial<PrizeCategoryInput> = {}): PrizeCategoryInput => ({ key, name: key, amount, metricKey: null, place: 1, requires: [], comboOf: [], ...over });

// The worked example from the spec: Champion ₦5,000 (win), Kill Leader ₦5,000 (most AK-47 kills), AK-47 Champion ₦15,000 (both).
const example = [
  cat("champion", 5_000 * NAIRA, { requires: ["win"] }),
  cat("leader", 5_000 * NAIRA, { metricKey: "ak" }),
  cat("combo", 15_000 * NAIRA, { comboOf: ["champion", "leader"] }),
];

describe("buildBoards", () => {
  const entries = [
    entry("p", 14, { met: { win: true }, targets: { ak: 12 } }),
    entry("q", 14, { met: { win: false }, targets: { ak: 8 } }),
    entry("r", 9, { met: { win: true }, targets: { ak: 3 } }),
  ];
  const awards = settleCategories({ categories: example, entries, direction: "HIGHER", tiebreakDirection: null, targetDirections: rules.targetDirections }).awards;
  const boards = buildBoards({ categories: example, entries, rules, awards });

  it("ranks the overall board by score, with level entries sharing a rank and the next rank skipping", () => {
    expect(boards.overall.map((r) => [r.userId, r.rank])).toEqual([["p", 1], ["q", 1], ["r", 3]]);
  });

  it("shows each player's total winnings on the overall board", () => {
    expect(boards.overall.find((r) => r.userId === "p")).toMatchObject({ winner: true, prize: 15_000 * NAIRA });
    expect(boards.overall.find((r) => r.userId === "q")).toMatchObject({ winner: false, prize: 0 });
  });

  it("gives a category its own eligible players ranked by its metric, with the holder marked", () => {
    const champion = boards.categories.find((c) => c.key === "champion")!;
    // Only players who won the match are eligible for Champion: p and r, not q.
    expect(champion.rows.map((r) => r.userId)).toEqual(["p", "r"]);
    const leader = boards.categories.find((c) => c.key === "leader")!;
    expect(leader.rows.map((r) => [r.userId, r.value])).toEqual([["p", 12], ["q", 8], ["r", 3]]);
  });

  it("shows the combined prize as held by whoever won both, and the replaced prizes as paid to nobody", () => {
    const combo = boards.categories.find((c) => c.key === "combo")!;
    expect(combo.combined).toBe(true);
    expect(combo.rows).toEqual([{ userId: "p", rank: 1, value: 14, winner: true, prize: 15_000 * NAIRA }]);
    // p held both, so p's separate champion and kill-leader prizes were replaced.
    expect(boards.categories.find((c) => c.key === "champion")!.rows.every((r) => r.prize === 0)).toBe(true);
    expect(boards.categories.find((c) => c.key === "leader")!.rows.every((r) => r.prize === 0)).toBe(true);
  });

  it("shows no holder for a combined prize nobody won", () => {
    const apart = [entry("p", 14, { met: { win: true }, targets: { ak: 5 } }), entry("q", 9, { met: { win: false }, targets: { ak: 8 } })];
    const a = settleCategories({ categories: example, entries: apart, direction: "HIGHER", tiebreakDirection: null, targetDirections: rules.targetDirections }).awards;
    expect(buildBoards({ categories: example, entries: apart, rules, awards: a }).categories.find((c) => c.key === "combo")!.rows).toEqual([]);
  });
});

describe("planSettlement: prize categories", () => {
  const base: SettlementInput = {
    mode: "CATEGORIES",
    categories: example,
    split: [],
    entries: [entry("p", 14, { met: { win: true }, targets: { ak: 12 } }), entry("q", 9, { met: { win: false }, targets: { ak: 8 } })],
    rules,
    collected: 100_000 * NAIRA, // 100 players at ₦1,000
    platformFeesBooked: 0,
    sponsor: 0,
    noWinnerPolicy: "HOUSE_KEEPS",
    approval: { autoApprove: true, autoApproveMaxKobo: 50_000_000 },
  };

  it("pays the combined prize and the house keeps the rest of the ₦100,000", () => {
    const plan = planSettlement(base);
    expect(plan).toMatchObject({ ok: true, awarded: 15_000 * NAIRA, houseToBook: 85_000 * NAIRA, refundAll: false, sponsorUsed: 0, requiresApproval: false });
    if (!plan.ok) return;
    expect(plan.awards).toEqual([{ categoryKey: "combo", userId: "p", amount: 15_000 * NAIRA }]);
    expect(reconcileBooks({ collected: base.collected, sponsorUsed: 0, awarded: plan.awarded, refunded: 0, houseToBook: plan.houseToBook, platformFeesBooked: 0 })).toBeNull();
  });

  it("keeps everything for the house when nobody qualifies and that is the policy", () => {
    const plan = planSettlement({ ...base, entries: [] });
    expect(plan).toMatchObject({ ok: true, awarded: 0, houseToBook: 100_000 * NAIRA, refundAll: false });
  });

  it("refunds every entry instead when that is the policy", () => {
    const plan = planSettlement({ ...base, entries: [], noWinnerPolicy: "REFUND_ENTRIES" });
    expect(plan).toMatchObject({ ok: true, awarded: 0, houseToBook: 0, refundAll: true });
  });

  it("does not refund when somebody did qualify, whatever the no-winner policy", () => {
    const plan = planSettlement({ ...base, noWinnerPolicy: "REFUND_ENTRIES" });
    expect(plan).toMatchObject({ ok: true, refundAll: false });
  });

  it("refuses to settle prizes bigger than the money there is to pay them", () => {
    const plan = planSettlement({ ...base, collected: 10_000 * NAIRA });
    expect(plan).toMatchObject({ ok: false, error: expect.stringContaining("Nothing has been paid") });
  });

  it("lets a sponsor cover a shortfall, and counts it so the books still balance", () => {
    const plan = planSettlement({ ...base, collected: 10_000 * NAIRA, sponsor: 8_000 * NAIRA });
    expect(plan).toMatchObject({ ok: true, awarded: 15_000 * NAIRA, sponsorUsed: 5_000 * NAIRA, houseToBook: 0, requiresApproval: true });
    if (!plan.ok) return;
    expect(reconcileBooks({ collected: 10_000 * NAIRA, sponsorUsed: plan.sponsorUsed, awarded: plan.awarded, refunded: 0, houseToBook: plan.houseToBook, platformFeesBooked: 0 })).toBeNull();
  });

  it("needs a named approval when the prizes are over the auto-approval limit, when auto-approval is off, or when a sponsor is involved", () => {
    expect(planSettlement({ ...base, approval: { autoApprove: true, autoApproveMaxKobo: 10_000 * NAIRA } })).toMatchObject({ requiresApproval: true });
    expect(planSettlement({ ...base, approval: { autoApprove: false, autoApproveMaxKobo: 50_000_000 } })).toMatchObject({ requiresApproval: true });
    expect(planSettlement({ ...base, sponsor: 1 })).toMatchObject({ requiresApproval: true });
    expect(planSettlement(base)).toMatchObject({ requiresApproval: false });
  });
});

describe("planSettlement: the older rank split", () => {
  const base: SettlementInput = {
    mode: "RANK_SPLIT",
    categories: [],
    split: [60, 40],
    entries: [entry("a", 20), entry("b", 15), entry("c", 5)],
    rules,
    collected: 2_000_000, // 20 players at ₦1,000
    platformFeesBooked: 100_000, // a 5% cut, booked as revenue at entry
    sponsor: 0,
    noWinnerPolicy: "HOUSE_KEEPS",
    approval: { autoApprove: true, autoApproveMaxKobo: 50_000_000 },
  };

  it("splits what's left after the platform's cut by rank, and the books balance", () => {
    const plan = planSettlement(base);
    expect(plan).toMatchObject({ ok: true, awarded: 1_900_000, houseToBook: 0 });
    if (!plan.ok) return;
    expect(plan.awards).toEqual([
      { categoryKey: "place-1", userId: "a", amount: 1_140_000 },
      { categoryKey: "place-2", userId: "b", amount: 760_000 },
    ]);
    expect(reconcileBooks({ collected: base.collected, sponsorUsed: 0, awarded: plan.awarded, refunded: 0, houseToBook: plan.houseToBook, platformFeesBooked: base.platformFeesBooked })).toBeNull();
  });

  it("gives the unawarded pool to the house when nobody qualifies", () => {
    const plan = planSettlement({ ...base, entries: [] });
    expect(plan).toMatchObject({ ok: true, awarded: 0, houseToBook: 1_900_000 });
  });
});

describe("reconcileBooks", () => {
  it("passes when what came in equals what went out, to the kobo", () => {
    expect(reconcileBooks({ collected: 100, sponsorUsed: 0, awarded: 60, refunded: 0, houseToBook: 40, platformFeesBooked: 0 })).toBeNull();
    expect(reconcileBooks({ collected: 100, sponsorUsed: 20, awarded: 80, refunded: 0, houseToBook: 30, platformFeesBooked: 10 })).toBeNull();
  });

  it("fails by even one kobo, and for a negative figure", () => {
    expect(reconcileBooks({ collected: 100, sponsorUsed: 0, awarded: 60, refunded: 0, houseToBook: 39, platformFeesBooked: 0 })).toMatch(/don't balance/);
    expect(reconcileBooks({ collected: 100, sponsorUsed: 0, awarded: 110, refunded: 0, houseToBook: -10, platformFeesBooked: 0 })).toMatch(/negative/);
  });
});

describe("describeSettlement", () => {
  it("says what happened in a line", () => {
    expect(describeSettlement({ ok: true, awards: [], awarded: 0, refundAll: true, houseToBook: 0, sponsorUsed: 0, requiresApproval: false })).toMatch(/refunded/);
    expect(describeSettlement({ ok: true, awards: [], awarded: 0, refundAll: false, houseToBook: 100_000, sponsorUsed: 0, requiresApproval: false })).toMatch(/house keeps ₦1,000/);
    expect(describeSettlement({ ok: true, awards: [{ categoryKey: "a", userId: "x", amount: 5000 }], awarded: 5000, refundAll: false, houseToBook: 95_000, sponsorUsed: 0, requiresApproval: false })).toMatch(/1 prize totalling ₦50/);
  });
});
