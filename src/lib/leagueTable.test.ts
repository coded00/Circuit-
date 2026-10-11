import { describe, it, expect } from "vitest";
import { buildLeagueTable, DEFAULT_LEAGUE_RULES, leagueOutcome, leagueSchedule, matchdayDeadlines, parseLeagueSettings, totalMatchdays, type LeagueMatch } from "./leagueTable";

let n = 0;
const win = (a: string, b: string, winner: string, score = "1-0", round = 1): LeagueMatch => ({ id: `m${n++}`, round, playerAId: a, playerBId: b, winnerId: winner, complete: true, draw: false, score });
const draw = (a: string, b: string, score = "1-1", round = 1): LeagueMatch => ({ id: `m${n++}`, round, playerAId: a, playerBId: b, winnerId: null, complete: true, draw: true, score });
const open = (a: string, b: string, round = 1): LeagueMatch => ({ id: `m${n++}`, round, playerAId: a, playerBId: b, winnerId: null, complete: false, draw: false, score: null });
const ids = ["a", "b", "c"];

describe("buildLeagueTable", () => {
  it("scores 3 for a win, 1 for a draw, 0 for a loss", () => {
    const t = buildLeagueTable(ids, [win("a", "b", "a", "2-0"), draw("b", "c", "1-1"), win("a", "c", "c", "0-1")], DEFAULT_LEAGUE_RULES);
    const row = (id: string) => t.find((r) => r.entryId === id)!;
    expect([row("a").points, row("b").points, row("c").points]).toEqual([3, 1, 4]);
    expect(row("c")).toMatchObject({ wins: 1, draws: 1, losses: 0, played: 2, gf: 2, ga: 1, gd: 1 });
    expect(t.map((r) => r.entryId)).toEqual(["c", "a", "b"]);
    expect(t.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("uses the organizer's points", () => {
    const t = buildLeagueTable(ids, [win("a", "b", "a"), draw("b", "c")], { winPoints: 2, drawPoints: 1 });
    expect(t.find((r) => r.entryId === "a")!.points).toBe(2);
  });

  it("breaks a two-way points tie on head-to-head before goal difference", () => {
    // a and b both finish on 4 points; b beat a directly, so b is ahead even though a has the better goal difference.
    const four = ["a", "b", "c", "d"];
    const matches = [
      win("a", "c", "a", "5-0"),
      draw("a", "d", "0-0"),
      win("a", "b", "b", "1-0"),
      win("b", "c", "c", "1-0"),
      draw("b", "d", "0-0"),
      win("c", "d", "d", "1-0"),
    ];
    const t = buildLeagueTable(four, matches, DEFAULT_LEAGUE_RULES);
    expect(t.map((r) => r.entryId)).toEqual(["d", "b", "a", "c"]);
    expect(t.find((r) => r.entryId === "a")!.gd).toBeGreaterThan(t.find((r) => r.entryId === "b")!.gd);
  });

  it("orders a points tie by goal difference when head-to-head is level", () => {
    const t = buildLeagueTable(["a", "b"], [draw("a", "b", "1-1")], DEFAULT_LEAGUE_RULES);
    expect(t.map((r) => r.rank)).toEqual([1, 1]);
    const t2 = buildLeagueTable(ids, [win("a", "b", "a", "3-0"), win("b", "c", "b", "1-0"), win("c", "a", "c", "1-0")], DEFAULT_LEAGUE_RULES);
    // Everyone has 3 points and a 1-1 head-to-head split: goal difference decides, a is +2, b is -2... c is 0.
    expect(t2[0].entryId).toBe("a");
  });

  it("ignores matches that aren't finished", () => {
    const t = buildLeagueTable(ids, [open("a", "b"), win("a", "c", "a")], DEFAULT_LEAGUE_RULES);
    expect(t.find((r) => r.entryId === "b")!.played).toBe(0);
  });
});

describe("leagueOutcome", () => {
  const rules = DEFAULT_LEAGUE_RULES;
  it("is playing until every match is done", () => {
    const matches = [win("a", "b", "a"), open("a", "c")];
    expect(leagueOutcome(buildLeagueTable(ids, matches, rules), matches, null).state).toBe("PLAYING");
  });
  it("crowns the outright leader", () => {
    const matches = [win("a", "b", "a"), win("a", "c", "a"), draw("b", "c")];
    expect(leagueOutcome(buildLeagueTable(ids, matches, rules), matches, null)).toEqual({ state: "DECIDED", winnerId: "a" });
  });
  it("needs a decider when first place is level on everything", () => {
    const matches = [draw("a", "b", "1-1"), draw("a", "c", "1-1"), draw("b", "c", "1-1")];
    const t = buildLeagueTable(ids, matches, rules);
    const out = leagueOutcome(t, matches, null);
    expect(out.state).toBe("NEEDS_DECIDER");
  });
  it("is decided by the decider once played", () => {
    const matches = [draw("a", "b"), draw("a", "c"), draw("b", "c")];
    const decider = win("a", "b", "b", "2-1", 4);
    expect(leagueOutcome(buildLeagueTable(ids, matches, rules), matches, decider)).toEqual({ state: "DECIDED", winnerId: "b" });
  });
});

describe("leagueSchedule", () => {
  it("plays everyone once in a single league, twice with home and away swapped in a double", () => {
    const four = ["a", "b", "c", "d"];
    const single = leagueSchedule(four, 1);
    expect(single).toHaveLength(3);
    expect(single.flatMap((r) => r.pairs)).toHaveLength(6);
    const double = leagueSchedule(four, 2);
    expect(double).toHaveLength(6);
    expect(double.map((r) => r.round)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(double.flatMap((r) => r.pairs)).toHaveLength(12);
    const firstLeg = new Set(single.flatMap((r) => r.pairs.map(([x, y]) => `${x}>${y}`)));
    const secondLeg = double.slice(3).flatMap((r) => r.pairs.map(([x, y]) => `${y}>${x}`));
    expect(secondLeg.every((k) => firstLeg.has(k))).toBe(true);
  });
  it("counts matchdays, with a bye round for odd fields", () => {
    expect([totalMatchdays(4, 1), totalMatchdays(5, 1), totalMatchdays(4, 2), totalMatchdays(1, 1)]).toEqual([3, 5, 6, 0]);
  });
});

describe("matchdayDeadlines", () => {
  it("makes matchday N due N periods after the start", () => {
    const d = matchdayDeadlines(3, Date.UTC(2026, 0, 1), 7);
    expect(d.map((x) => x.slice(0, 10))).toEqual(["2026-01-08", "2026-01-15", "2026-01-22"]);
  });
});

describe("parseLeagueSettings", () => {
  it("defaults to 3-1-0, single, weekly", () => {
    expect(parseLeagueSettings({})).toEqual({ ok: true, value: { winPoints: 3, drawPoints: 1, legs: 1, matchdayDays: 7 } });
  });
  it("turns draws off", () => {
    expect(parseLeagueSettings({ allowDraws: false })).toMatchObject({ ok: true, value: { drawPoints: null } });
  });
  it("rejects a draw worth as much as a win, and bad legs", () => {
    expect(parseLeagueSettings({ winPoints: 3, drawPoints: 3 }).ok).toBe(false);
    expect(parseLeagueSettings({ legs: 3 }).ok).toBe(false);
    expect(parseLeagueSettings({ matchdayDays: 0 }).ok).toBe(false);
  });
});
