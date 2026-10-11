import { describe, it, expect } from "vitest";
import { basisPointsToPercent, equalBasisPoints, FULL_SHARE_BP, parseTeamShares, splitByBasisPoints } from "./teamPrize";
import { prizePayoutSummary } from "./prizes";

describe("equalBasisPoints", () => {
  it("always adds up to 100%, with the odd points on the first player", () => {
    for (const n of [1, 2, 3, 4, 5, 7]) expect(equalBasisPoints(n).reduce((a, b) => a + b, 0)).toBe(FULL_SHARE_BP);
    expect(equalBasisPoints(3)).toEqual([3334, 3333, 3333]);
    expect(equalBasisPoints(0)).toEqual([]);
  });
});

describe("parseTeamShares", () => {
  const ids = ["cap", "a", "b"];
  it("splits equally when nothing is typed, captain first", () => {
    expect(parseTeamShares(ids, "cap", undefined)).toEqual({ ok: true, value: { cap: 3334, a: 3333, b: 3333 } });
  });
  it("accepts a custom split that makes 100%", () => {
    expect(parseTeamShares(ids, "cap", { cap: 50, a: 30, b: 20 })).toEqual({ ok: true, value: { cap: 5000, a: 3000, b: 2000 } });
  });
  it("settles a rounding hair on the captain", () => {
    const r = parseTeamShares(ids, "cap", { cap: 33.33, a: 33.33, b: 33.33 });
    expect(r.ok && Object.values(r.value).reduce((a, b) => a + b, 0)).toBe(FULL_SHARE_BP);
  });
  it("refuses totals that don't make 100%, and zero or missing shares", () => {
    expect(parseTeamShares(ids, "cap", { cap: 50, a: 30, b: 30 }).ok).toBe(false);
    expect(parseTeamShares(ids, "cap", { cap: 60, a: 40, b: 0 }).ok).toBe(false);
    expect(parseTeamShares(ids, "cap", { cap: 60, a: 40 }).ok).toBe(false);
  });
});

describe("splitByBasisPoints", () => {
  it("pays every kobo: the leftover goes to the first player", () => {
    const parts = splitByBasisPoints(100_001, [
      { userId: "cap", bp: 3334 },
      { userId: "a", bp: 3333 },
      { userId: "b", bp: 3333 },
    ]);
    expect(parts.reduce((a, p) => a + p.amount, 0)).toBe(100_001);
    expect(parts[0].amount).toBeGreaterThanOrEqual(parts[1].amount);
  });
  it("gives a 50/30/20 split of ₦2,000", () => {
    expect(splitByBasisPoints(200_000, [{ userId: "cap", bp: 5000 }, { userId: "a", bp: 3000 }, { userId: "b", bp: 2000 }]).map((p) => p.amount)).toEqual([100_000, 60_000, 40_000]);
  });
});

describe("basisPointsToPercent", () => {
  it("drops trailing zeros", () => {
    expect([basisPointsToPercent(3334), basisPointsToPercent(2500), basisPointsToPercent(10000)]).toEqual(["33.34", "25", "100"]);
  });
});

describe("prizePayoutSummary with team claims", () => {
  const row = (place: number, status: string) => ({ type: "PRIZE_PAYOUT", status, place });
  it("counts a single place claimed by several players", () => {
    expect(prizePayoutSummary([row(1, "COMPLETE"), row(1, "PENDING")], [])).toBe("1 player paid · 1 processing");
    expect(prizePayoutSummary([row(1, "COMPLETE")], [])).toBe("Sent");
  });
  it("counts a place as paid only when all its claimants are", () => {
    expect(prizePayoutSummary([row(1, "COMPLETE"), row(1, "COMPLETE"), row(2, "COMPLETE"), row(2, "PENDING")], [60, 40])).toBe("1 of 2 places paid · 1 processing");
  });
});
