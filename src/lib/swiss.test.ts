import { describe, expect, it } from "vitest";
import type { RRMatch } from "./roundRobin";
import { buildSwissTable, pairSwissRound, swissOutcome, swissRoundsFor, type SwissBye } from "./swiss";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const strength = (id: string) => -Number(id.slice(1)); // p1 strongest

/** Runs a whole Swiss where the stronger entry always wins. */
function simulate(n: number) {
  const entries = ids(n);
  const total = swissRoundsFor(n);
  const matches: RRMatch[] = [];
  const byes: SwissBye[] = [];
  let seq = 0;
  for (let round = 1; round <= total; round++) {
    const order = round === 1 ? entries : buildSwissTable(entries, matches, byes).map((r) => r.entryId);
    const { pairs, bye } = pairSwissRound(order, matches, byes);
    if (bye) byes.push({ round, userId: bye });
    for (const [a, b] of pairs) {
      matches.push({ id: `m${seq++}`, round, playerAId: a, playerBId: b, winnerId: strength(a) > strength(b) ? a : b, complete: true, score: "1-0" });
    }
  }
  return { entries, total, matches, byes, table: buildSwissTable(entries, matches, byes) };
}

describe("swiss", () => {
  it("uses ⌈log₂ n⌉ rounds", () => {
    expect([2, 3, 4, 5, 8, 9, 16, 64].map(swissRoundsFor)).toEqual([1, 2, 2, 3, 3, 4, 4, 6]);
  });

  it.each([4, 5, 7, 8, 12, 16, 33])("pairs %i entries without rematches, with at most one bye each, and crowns the strongest", (n) => {
    const { matches, byes, table, total } = simulate(n);
    const keys = matches.map((m) => [m.playerAId, m.playerBId].sort().join("|"));
    expect(new Set(keys).size).toBe(keys.length);
    const byeCount = new Map<string, number>();
    for (const b of byes) byeCount.set(b.userId, (byeCount.get(b.userId) ?? 0) + 1);
    expect([...byeCount.values()].every((c) => c === 1)).toBe(true);
    expect(byes.length).toBe(n % 2 === 1 ? total : 0);
    expect(table[0].entryId).toBe("p1");
    expect(table[0].wins).toBe(total);
  });

  it("gives the bye to the lowest-ranked entry that hasn't had one", () => {
    const { bye } = pairSwissRound(["a", "b", "c"], [], [{ round: 1, userId: "c" }]);
    expect(bye).toBe("b");
  });

  it("ranks level records by Buchholz (who you played), then score difference", () => {
    const m = (id: string, a: string, b: string, w: string, score = "1-0"): RRMatch => ({ id, round: 1, playerAId: a, playerBId: b, winnerId: w, complete: true, score });
    // x and y are both 1-1, but x played the two strongest entries (s and t, 2 wins each); y played w (0 wins) and t.
    const table = buildSwissTable(["x", "y", "s", "t", "w"], [
      m("1", "x", "s", "x"), m("2", "s", "t", "s"), m("3", "s", "w", "s"),
      m("4", "y", "w", "y"), m("5", "t", "x", "t"), m("6", "t", "y", "t"),
    ], []);
    const row = (id: string) => table.find((r) => r.entryId === id)!;
    expect([row("x").wins, row("y").wins]).toEqual([1, 1]);
    expect([row("x").buchholz, row("y").buchholz]).toEqual([4, 2]);
    expect(table.indexOf(row("x"))).toBeLessThan(table.indexOf(row("y")));
    // Level on wins and Buchholz: score difference decides.
    const byDiff = buildSwissTable(["a", "b", "c", "d"], [m("7", "a", "c", "a", "3-0"), m("8", "b", "d", "b", "1-0")], []);
    expect(byDiff[0].entryId).toBe("a");
  });

  it("moves to the next round, then decides, with a decider on a dead tie", () => {
    const done = (a: string, b: string, w: string): RRMatch => ({ id: a + b, round: 1, playerAId: a, playerBId: b, winnerId: w, complete: true, score: null });
    const regular = [done("a", "b", "a"), done("c", "d", "c")];
    const table = buildSwissTable(["a", "b", "c", "d"], regular, []);
    expect(swissOutcome(table, regular, 2, 1, null)).toEqual({ state: "NEXT_ROUND", round: 2 });
    const outcome = swissOutcome(table, regular, 1, 1, null);
    expect(outcome.state).toBe("NEEDS_DECIDER"); // a and c are both 1-0, Buchholz 0
    expect(swissOutcome(table, [...regular, { ...done("a", "c", "a"), complete: false, winnerId: null }], 1, 1, null)).toEqual({ state: "PLAYING" });
  });
});
