import { describe, expect, it } from "vitest";
import {
  categoryPublishRefusal,
  houseTake,
  meetsMinimumScore,
  parsePrizeCategories,
  prizeFundingError,
  recordingRefusal,
  settleCategories,
  worstCasePayout,
  type PrizeCategoryInput,
  type SettleEntry,
} from "@/lib/challengePrizes";

/**
 * How a challenge pays several prizes at once. The cases that matter are the ones with money in them: a combined prize
 * replacing two separate ones for the same player, a tie sharing a place, a category nobody qualifies for, and the
 * funding rule that stops a challenge promising more than its entries can pay.
 */

const ctx = { requirementKeys: new Set(["win", "ak", "hs"]), targetKeys: new Set(["ak", "hs"]) };
const naira = (n: number) => n * 100;

describe("parsePrizeCategories", () => {
  it("accepts ordinary and combined categories", () => {
    const r = parsePrizeCategories(
      [
        { key: "champ", name: "Champion", amount: naira(5000), requires: ["win"] },
        { key: "lead", name: "Kill Leader", amount: naira(5000), metricKey: "ak" },
        { key: "combo", name: "AK-47 Champion", amount: naira(15000), comboOf: ["champ", "lead"] },
      ],
      ctx,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((c) => [c.name, c.metricKey, c.place, c.comboOf])).toEqual([
      ["Champion", null, 1, []],
      ["Kill Leader", "ak", 1, []],
      ["AK-47 Champion", null, 1, ["champ", "lead"]],
    ]);
  });

  it("treats nothing as no categories", () => {
    for (const none of [undefined, null, "", []]) expect(parsePrizeCategories(none, ctx)).toEqual({ ok: true, value: [] });
  });

  it("refuses a bad name, a bad amount, a duplicate, and too many", () => {
    expect(parsePrizeCategories([{ name: " ", amount: 100 }], ctx)).toMatchObject({ ok: false, error: expect.stringContaining("needs a name") });
    expect(parsePrizeCategories([{ name: "A", amount: 0 }], ctx)).toMatchObject({ ok: false, error: expect.stringContaining("more than zero") });
    expect(parsePrizeCategories([{ name: "A", amount: 1.5 }], ctx).ok).toBe(false);
    expect(parsePrizeCategories([{ name: "A", amount: 100 }, { name: "a", amount: 100 }], ctx)).toMatchObject({ ok: false, error: expect.stringContaining("twice") });
    const nine = Array.from({ length: 9 }, (_, i) => ({ name: `Prize ${i}`, amount: 100 }));
    expect(parsePrizeCategories(nine, ctx)).toMatchObject({ ok: false, error: expect.stringContaining("at most 8") });
  });

  it("only lets a category rank by a number target and require real requirements", () => {
    expect(parsePrizeCategories([{ name: "A", amount: 100, metricKey: "win" }], ctx)).toMatchObject({ ok: false, error: expect.stringContaining("number target") });
    expect(parsePrizeCategories([{ name: "A", amount: 100, metricKey: "nope" }], ctx).ok).toBe(false);
    expect(parsePrizeCategories([{ name: "A", amount: 100, requires: ["nope"] }], ctx).ok).toBe(false);
    expect(parsePrizeCategories([{ name: "A", amount: 100, place: 9 }], ctx).ok).toBe(false);
  });

  it("checks a combined prize: two or more real, uncombined categories, no metric of its own, each used once", () => {
    const base = [
      { key: "a", name: "A", amount: 100 },
      { key: "b", name: "B", amount: 100 },
      { key: "c", name: "C", amount: 100 },
    ];
    expect(parsePrizeCategories([...base, { key: "k", name: "K", amount: 300, comboOf: ["a"] }], ctx).ok).toBe(false);
    expect(parsePrizeCategories([...base, { key: "k", name: "K", amount: 300, comboOf: ["a", "zzz"] }], ctx)).toMatchObject({ ok: false, error: expect.stringContaining("doesn't exist") });
    expect(parsePrizeCategories([...base, { key: "k", name: "K", amount: 300, comboOf: ["a", "b"], metricKey: "ak" }], ctx).ok).toBe(false);
    expect(parsePrizeCategories([...base, { key: "k", name: "K", amount: 300, comboOf: ["a", "b"] }, { key: "k2", name: "K2", amount: 300, comboOf: ["b", "c"] }], ctx)).toMatchObject({ ok: false, error: expect.stringContaining("already part") });
    expect(parsePrizeCategories([...base, { key: "k", name: "K", amount: 300, comboOf: ["a", "b"] }, { key: "k2", name: "K2", amount: 300, comboOf: ["k", "c"] }], ctx)).toMatchObject({ ok: false, error: expect.stringContaining("another combined") });
  });
});

describe("the funding rule", () => {
  const packA = [{ amount: naira(10_000) }, { amount: naira(4_000) }];

  it("adds up the worst case", () => {
    expect(worstCasePayout(packA)).toBe(naira(14_000));
    expect(worstCasePayout([])).toBe(0);
  });

  it("lets prizes up to the cap through: 20 players at ₦1,000 and a 70% cap pays at most ₦14,000", () => {
    expect(prizeFundingError({ categories: packA, entryFee: naira(1000), minEntrants: 20, maxPayoutBps: 7000, sponsorKobo: 0 })).toBeNull();
  });

  it("refuses one kobo over the cap, and says what it can pay", () => {
    const over = [{ amount: naira(10_000) }, { amount: naira(4_000) + 1 }];
    const msg = prizeFundingError({ categories: over, entryFee: naira(1000), minEntrants: 20, maxPayoutBps: 7000, sponsorKobo: 0 });
    expect(msg).toMatch(/₦14,000/);
    expect(msg).toMatch(/20 players/);
  });

  it("counts a sponsor on top, and refuses a free challenge with prizes and no sponsor", () => {
    const big = [{ amount: naira(20_000) }];
    expect(prizeFundingError({ categories: big, entryFee: naira(1000), minEntrants: 20, maxPayoutBps: 7000, sponsorKobo: 0 })).not.toBeNull();
    expect(prizeFundingError({ categories: big, entryFee: naira(1000), minEntrants: 20, maxPayoutBps: 7000, sponsorKobo: naira(6000) })).toBeNull();
    expect(prizeFundingError({ categories: big, entryFee: 0, minEntrants: 20, maxPayoutBps: 7000, sponsorKobo: 0 })).not.toBeNull();
    expect(prizeFundingError({ categories: big, entryFee: 0, minEntrants: 20, maxPayoutBps: 7000, sponsorKobo: naira(20_000) })).toBeNull();
  });

  it("has nothing to check when there are no categories", () => {
    expect(prizeFundingError({ categories: [], entryFee: 0, minEntrants: 1, maxPayoutBps: 0, sponsorKobo: 0 })).toBeNull();
  });
});

describe("settleCategories", () => {
  const entry = (userId: string, score: number, over: Partial<SettleEntry> = {}): SettleEntry => ({ userId, score, tiebreakScore: null, targets: {}, met: {}, ...over });
  const run = (categories: PrizeCategoryInput[], entries: SettleEntry[], over: { direction?: "HIGHER" | "LOWER"; targetDirections?: Record<string, "HIGHER" | "LOWER"> } = {}) =>
    settleCategories({ categories, entries, direction: over.direction ?? "HIGHER", tiebreakDirection: null, targetDirections: over.targetDirections ?? {} });
  const cat = (key: string, amount: number, over: Partial<PrizeCategoryInput> = {}): PrizeCategoryInput => ({ key, name: key, amount, metricKey: null, place: 1, requires: [], comboOf: [], ...over });

  it("pays a podium by rank", () => {
    const r = run([cat("first", naira(10_000)), cat("second", naira(4_000), { place: 2 })], [entry("a", 10), entry("b", 18), entry("c", 14)]);
    expect(r.awards).toEqual([
      { categoryKey: "first", userId: "b", amount: naira(10_000) },
      { categoryKey: "second", userId: "c", amount: naira(4_000) },
    ]);
    expect(r.awarded).toBe(naira(14_000));
  });

  it("shares a tied place equally, and a tie for first takes the second place's prize with it", () => {
    const r = run([cat("first", naira(10_000)), cat("second", naira(4_000), { place: 2 })], [entry("a", 18), entry("b", 18), entry("c", 5)]);
    const total = (u: string) => r.awards.filter((x) => x.userId === u).reduce((s, x) => s + x.amount, 0);
    // a and b occupy places 1 and 2 together, so they share ₦10,000 + ₦4,000 between them.
    expect(total("a")).toBe(naira(7_000));
    expect(total("b")).toBe(naira(7_000));
    expect(total("c")).toBe(0);
    expect(r.awarded).toBe(naira(14_000));
  });

  it("always pays out exactly the prize, down to the odd kobo", () => {
    const r = run([cat("first", 10_001)], [entry("a", 9), entry("b", 9), entry("c", 9)]);
    expect(r.awarded).toBe(10_001);
    expect(r.awards.map((a) => a.amount).sort()).toEqual([3333, 3333, 3335]);
  });

  it("ranks lower-is-better scores the right way round", () => {
    const r = run([cat("fastest", 500)], [entry("a", 90), entry("b", 60), entry("c", 75)], { direction: "LOWER" });
    expect(r.awards).toEqual([{ categoryKey: "fastest", userId: "b", amount: 500 }]);
  });

  it("only considers entries that meet a category's own requirement", () => {
    const r = run(
      [cat("champion", 5000, { requires: ["win"] })],
      [entry("a", 20, { met: { win: false } }), entry("b", 12, { met: { win: true } }), entry("c", 9, { met: { win: true } })],
    );
    // a has the best score but didn't win the match, so the champion prize is between the winners.
    expect(r.awards).toEqual([{ categoryKey: "champion", userId: "b", amount: 5000 }]);
  });

  it("ranks by a number target, with the ranked score breaking a tie", () => {
    const r = run(
      [cat("ak", 5000, { metricKey: "ak" })],
      [entry("a", 10, { targets: { ak: 7 } }), entry("b", 14, { targets: { ak: 7 } }), entry("c", 20, { targets: { ak: 3 } })],
    );
    expect(r.awards).toEqual([{ categoryKey: "ak", userId: "b", amount: 5000 }]);
  });

  it("leaves out an entry with no verified number for the metric", () => {
    const r = run([cat("ak", 5000, { metricKey: "ak" })], [entry("a", 30), entry("b", 5, { targets: { ak: 2 } })]);
    expect(r.awards).toEqual([{ categoryKey: "ak", userId: "b", amount: 5000 }]);
  });

  describe("the worked example: AK-47 Battle Royale, ₦1,000 entry", () => {
    // Champion ₦5,000 (wins the match), Kill Leader ₦5,000 (most AK-47 kills), AK-47 Champion ₦15,000 (both).
    const categories = [
      cat("champion", naira(5_000), { requires: ["win"] }),
      cat("leader", naira(5_000), { metricKey: "ak" }),
      cat("combo", naira(15_000), { comboOf: ["champion", "leader"] }),
    ];

    it("pays the combined prize alone when one player wins both — not the two separate ones as well", () => {
      const r = run(categories, [
        entry("p", 14, { met: { win: true }, targets: { ak: 12 } }),
        entry("q", 9, { met: { win: false }, targets: { ak: 8 } }),
      ]);
      expect(r.awards).toEqual([{ categoryKey: "combo", userId: "p", amount: naira(15_000) }]);
      expect(r.awarded).toBe(naira(15_000));
      // The two replaced prizes are not given to anyone else: they stay with the house.
      expect(r.categories.find((c) => c.key === "champion")).toMatchObject({ awarded: 0, unawarded: naira(5_000) });
      expect(r.categories.find((c) => c.key === "leader")).toMatchObject({ awarded: 0, unawarded: naira(5_000) });
      expect(houseTake(naira(100_000), r.awarded)).toBe(naira(85_000));
    });

    it("pays the two separate prizes when different players win them, and the combined prize goes unawarded", () => {
      const r = run(categories, [
        entry("p", 14, { met: { win: true }, targets: { ak: 5 } }),
        entry("q", 9, { met: { win: false }, targets: { ak: 8 } }),
      ]);
      expect(r.awards).toEqual([
        { categoryKey: "champion", userId: "p", amount: naira(5_000) },
        { categoryKey: "leader", userId: "q", amount: naira(5_000) },
      ]);
      expect(r.categories.find((c) => c.key === "combo")).toMatchObject({ awarded: 0, unawarded: naira(15_000) });
    });

    it("pays nothing, and the house keeps everything, when nobody qualifies", () => {
      const r = run(categories, []);
      expect(r.awards).toEqual([]);
      expect(r.awarded).toBe(0);
      expect(r.categories.every((c) => c.unawarded === c.amount)).toBe(true);
      expect(houseTake(naira(100_000), r.awarded)).toBe(naira(100_000));
    });

    it("never pays more than the categories promise", () => {
      const r = run(categories, [
        entry("p", 14, { met: { win: true }, targets: { ak: 12 } }),
        entry("q", 14, { met: { win: true }, targets: { ak: 12 } }),
      ]);
      // p and q tie for everything: the combined prize is shared, and nothing else is paid.
      expect(r.awarded).toBeLessThanOrEqual(worstCasePayout(categories));
      expect(r.awards.reduce((s, a) => s + a.amount, 0)).toBe(r.awarded);
      expect(r.awards.filter((a) => a.categoryKey === "combo").map((a) => a.amount)).toEqual([naira(7_500), naira(7_500)]);
    });
  });

  it("gives the same answer however the entries are ordered", () => {
    const categories = [cat("first", 10_000), cat("second", 4_000, { place: 2 })];
    const entries = [entry("a", 5), entry("b", 9), entry("c", 9), entry("d", 2)];
    const forward = run(categories, entries);
    const backward = run(categories, [...entries].reverse());
    expect(backward).toEqual(forward);
  });
});

describe("houseTake", () => {
  it("is what was collected less what was awarded, never below zero", () => {
    expect(houseTake(naira(100_000), naira(25_000))).toBe(naira(75_000));
    expect(houseTake(100, 250)).toBe(0);
  });
});

describe("meetsMinimumScore", () => {
  it("lets everyone through when there is no minimum, and applies the right direction when there is", () => {
    expect(meetsMinimumScore({ minScore: null, direction: "HIGHER", score: 0 })).toBe(true);
    expect(meetsMinimumScore({ minScore: 5, direction: "HIGHER", score: 5 })).toBe(true);
    expect(meetsMinimumScore({ minScore: 5, direction: "HIGHER", score: 4 })).toBe(false);
    expect(meetsMinimumScore({ minScore: 600, direction: "LOWER", score: 600 })).toBe(true);
    expect(meetsMinimumScore({ minScore: 600, direction: "LOWER", score: 601 })).toBe(false);
  });
});

describe("recordingRefusal", () => {
  const base = { kind: "SKILL" as const, scoreNeedsRecording: false, requireRecording: false, categories: [], recordingStatKeys: new Set<string>() };

  it("is satisfied once a recording is required, whatever the challenge", () => {
    expect(recordingRefusal({ ...base, kind: "WEAPON", requireRecording: true })).toBeNull();
  });

  it("insists on a recording for a weapon challenge and for a score that isn't on the scoreboard", () => {
    expect(recordingRefusal({ ...base, kind: "WEAPON" })).toMatch(/recording/);
    expect(recordingRefusal({ ...base, scoreNeedsRecording: true })).toMatch(/scoreboard/);
  });

  it("insists on a recording when a prize depends on a stat that can't be read off the scoreboard", () => {
    const categories = [{ name: "Headshot Hunter", metricKey: "hs", requires: [] as string[] }];
    expect(recordingRefusal({ ...base, categories, recordingStatKeys: new Set(["hs"]) })).toMatch(/Headshot Hunter/);
    expect(recordingRefusal({ ...base, categories: [{ name: "Champion", metricKey: null, requires: ["win"] }], recordingStatKeys: new Set(["hs"]) })).toBeNull();
    expect(recordingRefusal({ ...base, categories: [{ name: "X", metricKey: null, requires: ["hs"] }], recordingStatKeys: new Set(["hs"]) })).toMatch(/"X"/);
  });

  it("asks for nothing extra for a plain scoreboard challenge", () => {
    expect(recordingRefusal(base)).toBeNull();
  });
});

describe("categoryPublishRefusal", () => {
  const base = {
    kind: "SKILL" as const,
    weaponLabel: null,
    scoreNeedsRecording: false,
    requireRecording: false,
    prizeSplit: [] as number[],
    categories: [{ key: "a", name: "A", amount: naira(10_000), metricKey: null, place: 1, requires: [], comboOf: [] }] as PrizeCategoryInput[],
    recordingStatKeys: new Set<string>(),
    entryFee: naira(1000),
    minEntrants: 20,
    maxPayoutBps: 7000,
    sponsorKobo: 0,
  };

  it("passes a funded challenge", () => {
    expect(categoryPublishRefusal(base)).toBeNull();
  });

  it("wants a weapon named for a weapon challenge, and a recording", () => {
    expect(categoryPublishRefusal({ ...base, kind: "WEAPON", requireRecording: true })).toMatch(/which weapon/);
    expect(categoryPublishRefusal({ ...base, kind: "WEAPON", weaponLabel: "AK-47" })).toMatch(/recording/);
    expect(categoryPublishRefusal({ ...base, kind: "WEAPON", weaponLabel: "AK-47", requireRecording: true })).toBeNull();
  });

  it("refuses prizes the entries can't fund at the minimum field, at the 70% cap", () => {
    const big = [{ ...base.categories[0], amount: naira(14_001) }];
    expect(categoryPublishRefusal({ ...base, categories: big })).toMatch(/₦14,000/);
  });

  it("refuses both a rank split and categories", () => {
    expect(categoryPublishRefusal({ ...base, prizeSplit: [60, 40] })).toMatch(/not both/);
  });

  it("still applies the recording rule when there are no categories", () => {
    expect(categoryPublishRefusal({ ...base, categories: [], kind: "WEAPON", weaponLabel: "AK-47" })).toMatch(/recording/);
    expect(categoryPublishRefusal({ ...base, categories: [] })).toBeNull();
  });
});
