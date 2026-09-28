import { describe, expect, it } from "vitest";
import { describeSplit, maxPrizePlaces, parsePrizeSplit, plannedShares, prizeShares } from "./prizes";

describe("parsePrizeSplit", () => {
  it("accepts splits that make 100% in order", () => {
    expect(parsePrizeSplit([50, 30, 20], 3)).toEqual({ ok: true, value: [50, 30, 20] });
    expect(parsePrizeSplit("60, 40", 3)).toEqual({ ok: true, value: [60, 40] });
    expect(parsePrizeSplit("60/40", 3)).toEqual({ ok: true, value: [60, 40] });
  });
  it("stores winner-takes-all as empty", () => {
    expect(parsePrizeSplit([100], 3)).toEqual({ ok: true, value: [] });
    expect(parsePrizeSplit(undefined, 3)).toEqual({ ok: true, value: [] });
    // The create/edit forms send [] when there's no cash prize.
    expect(parsePrizeSplit([], 3)).toEqual({ ok: true, value: [] });
    expect(parsePrizeSplit("  ", 3)).toEqual({ ok: true, value: [] });
  });
  it("rejects bad splits", () => {
    expect(parsePrizeSplit([50, 30], 3)).toMatchObject({ ok: false, error: "The shares add up to 80% — they need to make 100%." });
    expect(parsePrizeSplit([30, 70], 3).ok).toBe(false);
    expect(parsePrizeSplit([40, 30, 20, 10], 3)).toMatchObject({ ok: false, error: "This tournament can pay at most 3 places." });
    expect(parsePrizeSplit([50.5, 49.5], 3).ok).toBe(false);
    expect(parsePrizeSplit([100, 0], 3).ok).toBe(false);
  });
});

describe("maxPrizePlaces", () => {
  it("limits knockouts to 1st, 2nd and a shared 3rd", () => {
    expect(maxPrizePlaces("KNOCKOUT", 16)).toBe(3);
    expect(maxPrizePlaces("KNOCKOUT", 2)).toBe(2);
    expect(maxPrizePlaces("ROUND_ROBIN", 6)).toBe(6);
    expect(maxPrizePlaces("LOBBY_POINTS", 100)).toBe(8);
  });
});

describe("describeSplit / plannedShares", () => {
  it("describes and plans", () => {
    expect(describeSplit([])).toBe("Winner takes all");
    expect(describeSplit([60, 40])).toBe("1st 60% · 2nd 40%");
    expect(plannedShares(100_000, [50, 30, 20])).toEqual([
      { place: 1, percent: 50, amount: 50_000 },
      { place: 2, percent: 30, amount: 30_000 },
      { place: 3, percent: 20, amount: 20_000 },
    ]);
    // Uneven kobo go to 1st.
    expect(plannedShares(100, [70, 20, 10]).map((r) => r.amount)).toEqual([70, 20, 10]);
    expect(plannedShares(101, [34, 33, 33]).reduce((a, r) => a + r.amount, 0)).toBe(101);
  });
});

describe("prizeShares", () => {
  it("pays each place its share", () => {
    expect(prizeShares(100_000, [60, 40], [{ userIds: ["a"] }, { userIds: ["b"] }, { userIds: ["c"] }])).toEqual([
      { userId: "a", place: 1, sharedWith: 1, amount: 60_000 },
      { userId: "b", place: 2, sharedWith: 1, amount: 40_000 },
    ]);
  });
  it("winner takes all", () => {
    expect(prizeShares(50_000, [], [{ userIds: ["a"] }, { userIds: ["b"] }])).toEqual([{ userId: "a", place: 1, sharedWith: 1, amount: 50_000 }]);
  });
  it("splits a shared 3rd between the semi-final losers", () => {
    const shares = prizeShares(100_000, [50, 30, 20], [{ userIds: ["a"] }, { userIds: ["b"] }, { userIds: ["c", "d"] }]);
    expect(shares.map((s) => [s.userId, s.place, s.amount])).toEqual([["a", 1, 50_000], ["b", 2, 30_000], ["c", 3, 10_000], ["d", 3, 10_000]]);
  });
  it("gives a tie the combined share of the places it covers, even past the end of the split", () => {
    // b and c tie for 2nd: they share 2nd+3rd = 50%.
    let shares = prizeShares(100_000, [50, 30, 20], [{ userIds: ["a"] }, { userIds: ["b", "c"] }, { userIds: ["d"] }]);
    expect(shares.map((s) => [s.userId, s.place, s.amount])).toEqual([["a", 1, 50_000], ["b", 2, 25_000], ["c", 2, 25_000]]);
    // Three tie for 2nd with only 2nd paid: they share 40%.
    shares = prizeShares(90_000, [60, 40], [{ userIds: ["a"] }, { userIds: ["b", "c", "d"] }]);
    expect(shares.map((s) => s.amount)).toEqual([54_000, 12_000, 12_000, 12_000]);
  });
  it("never pays out more than the pool, with odd kobo going to 1st", () => {
    const shares = prizeShares(100_001, [50, 30, 20], [{ userIds: ["a"] }, { userIds: ["b"] }, { userIds: ["c", "d", "e"] }]);
    expect(shares.reduce((a, s) => a + s.amount, 0)).toBe(100_001);
    expect(shares[0].amount).toBeGreaterThanOrEqual(50_000);
  });
});
