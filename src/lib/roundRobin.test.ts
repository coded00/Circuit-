import { describe, expect, it } from "vitest";
import { buildRoundRobinTable, parseScore, roundRobinOutcome, roundRobinSchedule, totalRoundRobinRounds, type RRMatch } from "./roundRobin";

const pairKey = ([a, b]: [string, string]) => [a, b].sort().join("-");

describe("roundRobinSchedule", () => {
  it.each([2, 3, 4, 5, 8, 16])("pairs %i entries so everyone meets once and nobody plays twice a round", (n) => {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const rounds = roundRobinSchedule(ids);
    expect(rounds).toHaveLength(totalRoundRobinRounds(n));
    const seen = new Set<string>();
    for (const r of rounds) {
      const inRound = r.pairs.flat();
      expect(new Set(inRound).size).toBe(inRound.length);
      for (const p of r.pairs) {
        expect(seen.has(pairKey(p))).toBe(false);
        seen.add(pairKey(p));
      }
    }
    expect(seen.size).toBe((n * (n - 1)) / 2);
  });
  it("returns nothing for fewer than two entries", () => {
    expect(roundRobinSchedule(["solo"])).toEqual([]);
  });
});

describe("parseScore", () => {
  it("reads common score formats", () => {
    expect(parseScore("3-1")).toEqual([3, 1]);
    expect(parseScore(" 2 : 2 ")).toEqual([2, 2]);
    expect(parseScore("10–7")).toEqual([10, 7]);
    expect(parseScore("won on pens")).toBeNull();
    expect(parseScore(null)).toBeNull();
  });
});

let seq = 0;
const m = (a: string, b: string, winner: string | null, score: string | null = null, round = 1): RRMatch => ({
  id: `m${seq++}`,
  round,
  playerAId: a,
  playerBId: b,
  winnerId: winner,
  complete: winner !== null,
  score,
});

describe("buildRoundRobinTable", () => {
  it("ranks by wins", () => {
    const table = buildRoundRobinTable(["a", "b", "c"], [m("a", "b", "a"), m("a", "c", "a"), m("b", "c", "b")]);
    expect(table.map((r) => [r.entryId, r.rank, r.wins, r.losses])).toEqual([["a", 1, 2, 0], ["b", 2, 1, 1], ["c", 3, 0, 2]]);
  });
  it("breaks a two-way tie on head-to-head", () => {
    // a and b both 2-1; b beat a.
    const table = buildRoundRobinTable(["a", "b", "c", "d"], [
      m("a", "b", "b"), m("a", "c", "a"), m("a", "d", "a"),
      m("b", "c", "c"), m("b", "d", "b"), m("c", "d", "d"),
    ]);
    expect(table.slice(0, 2).map((r) => r.entryId)).toEqual(["b", "a"]);
    expect(table[0].rank).toBe(1);
    expect(table[1].rank).toBe(2);
  });
  it("breaks a three-way cycle on score difference, and shares rank when still level", () => {
    // a>b, b>c, c>a — all 1-1. a won by more.
    let table = buildRoundRobinTable(["a", "b", "c"], [m("a", "b", "a", "3-0"), m("b", "c", "b", "2-1"), m("c", "a", "c", "2-1")]);
    expect(table.map((r) => [r.entryId, r.diff])).toEqual([["a", 2], ["c", 0], ["b", -2]]);
    table = buildRoundRobinTable(["a", "b", "c"], [m("a", "b", "a", "1-0"), m("b", "c", "b", "1-0"), m("c", "a", "c", "1-0")]);
    expect(table.map((r) => r.rank)).toEqual([1, 1, 1]);
  });
});

describe("roundRobinOutcome", () => {
  it("is still playing until every regular match is done", () => {
    const regular = [m("a", "b", "a"), m("a", "c", null)];
    expect(roundRobinOutcome(buildRoundRobinTable(["a", "b", "c"], regular), regular, null)).toEqual({ state: "PLAYING" });
  });
  it("crowns an outright leader", () => {
    const regular = [m("a", "b", "a"), m("a", "c", "a"), m("b", "c", "b")];
    expect(roundRobinOutcome(buildRoundRobinTable(["a", "b", "c"], regular), regular, null)).toEqual({ state: "DECIDED", winnerId: "a" });
  });
  it("asks for a decider when first is tied on everything, then takes its winner", () => {
    const regular = [m("a", "b", "a", "1-0"), m("b", "c", "b", "1-0"), m("c", "a", "c", "1-0")];
    const table = buildRoundRobinTable(["a", "b", "c"], regular);
    const outcome = roundRobinOutcome(table, regular, null);
    expect(outcome.state).toBe("NEEDS_DECIDER");
    const decider = m("a", "b", null, null, 99);
    expect(roundRobinOutcome(table, regular, decider)).toEqual({ state: "PLAYING" });
    expect(roundRobinOutcome(table, regular, { ...decider, winnerId: "b", complete: true })).toEqual({ state: "DECIDED", winnerId: "b" });
  });
});
