import { describe, expect, it } from "vitest";
import {
  buildLeaderboard,
  describePoints,
  effectiveTable,
  leaderboardWinner,
  parseKillPoints,
  parseLobbyRounds,
  parsePlacementPoints,
  pointsFor,
  STANDARD_PLACEMENT_POINTS,
  validateRoundResults,
} from "./lobbyScoring";

const table = effectiveTable({ placementPoints: [], killPoints: 1 });

describe("points", () => {
  it("falls back to the standard table", () => {
    expect(table.placementPoints).toEqual([...STANDARD_PLACEMENT_POINTS]);
    expect(effectiveTable({ placementPoints: [15, 12], killPoints: 2 })).toEqual({ placementPoints: [15, 12], killPoints: 2 });
  });
  it("scores placement plus kills, and nothing for not playing", () => {
    expect(pointsFor(1, 5, table)).toBe(15);
    expect(pointsFor(8, 0, table)).toBe(1);
    expect(pointsFor(12, 3, table)).toBe(3); // past the table: kills only
    expect(pointsFor(null, 0, table)).toBe(0);
  });
  it("describes the table, grouping equal places", () => {
    expect(describePoints(table)).toBe("1st 10 · 2nd 6 · 3rd 5 · 4th 4 · 5th 3 · 6th 2 · 7th–8th 1 · 1 per kill");
    expect(describePoints({ placementPoints: [], killPoints: 0 })).toBe("No points");
  });
});

describe("parsing admin and organizer input", () => {
  it("parses placement points", () => {
    expect(parsePlacementPoints("10, 6 5,4 0 0")).toEqual({ ok: true, value: [10, 6, 5, 4] });
    expect(parsePlacementPoints("")).toEqual({ ok: true, value: [] });
    expect(parsePlacementPoints([3, 2, 1])).toEqual({ ok: true, value: [3, 2, 1] });
    expect(parsePlacementPoints("5, 6").ok).toBe(false);
    expect(parsePlacementPoints("ten").ok).toBe(false);
    expect(parsePlacementPoints("-1").ok).toBe(false);
  });
  it("parses kill points and rounds with defaults", () => {
    expect(parseKillPoints("")).toEqual({ ok: true, value: 1 });
    expect(parseKillPoints("2")).toEqual({ ok: true, value: 2 });
    expect(parseKillPoints("1.5").ok).toBe(false);
    expect(parseLobbyRounds(undefined)).toEqual({ ok: true, value: 4 });
    expect(parseLobbyRounds(21).ok).toBe(false);
    expect(parseLobbyRounds(0).ok).toBe(false);
  });
});

describe("validateRoundResults", () => {
  const ids = ["a", "b", "c"];
  it("accepts results and fills in entries left out as not played", () => {
    const r = validateRoundResults([{ registrationId: "a", placement: 2, kills: 3 }, { registrationId: "b", placement: "1", kills: "0" }], ids);
    expect(r).toEqual({ ok: true, value: [
      { registrationId: "a", placement: 2, kills: 3 },
      { registrationId: "b", placement: 1, kills: 0 },
      { registrationId: "c", placement: null, kills: 0 },
    ] });
  });
  it("rejects shared places, out-of-range places, unknown entries and kills without a place", () => {
    expect(validateRoundResults([{ registrationId: "a", placement: 1 }, { registrationId: "b", placement: 1 }], ids)).toMatchObject({ ok: false, error: "Two entries can't both finish 1st." });
    expect(validateRoundResults([{ registrationId: "a", placement: 4 }], ids).ok).toBe(false);
    expect(validateRoundResults([{ registrationId: "zz", placement: 1 }], ids).ok).toBe(false);
    expect(validateRoundResults([{ registrationId: "a", placement: null, kills: 2 }], ids).ok).toBe(false);
    expect(validateRoundResults([{ registrationId: "a", placement: 1 }, { registrationId: "a", placement: 2 }], ids).ok).toBe(false);
    expect(validateRoundResults([], ids).ok).toBe(false);
  });
});

describe("buildLeaderboard", () => {
  it("totals rounds and ranks by points", () => {
    const board = buildLeaderboard(["a", "b", "c"], [
      { roundNumber: 1, registrationId: "a", placement: 1, kills: 2 }, // 12
      { roundNumber: 1, registrationId: "b", placement: 2, kills: 8 }, // 14
      { roundNumber: 1, registrationId: "c", placement: null, kills: 0 },
      { roundNumber: 2, registrationId: "a", placement: 1, kills: 0 }, // 10
      { roundNumber: 2, registrationId: "b", placement: 3, kills: 1 }, // 6
      { roundNumber: 2, registrationId: "c", placement: 2, kills: 0 }, // 6
    ], table);
    expect(board.map((r) => [r.registrationId, r.rank, r.total])).toEqual([["a", 1, 22], ["b", 2, 20], ["c", 3, 6]]);
    expect(board[0]).toMatchObject({ wins: 2, played: 2, kills: 2 });
    expect(board[2].rounds[1]).toEqual({ placement: null, kills: 0, points: 0 });
    expect(leaderboardWinner(board)).toBe("a");
  });
  it("breaks ties on wins, then placement points, then kills, then the latest round", () => {
    // Both 10 points: a won a round, b got there on kills.
    let board = buildLeaderboard(["a", "b"], [
      { roundNumber: 1, registrationId: "a", placement: 1, kills: 0 },
      { roundNumber: 1, registrationId: "b", placement: 8, kills: 9 },
    ], table);
    expect(board.map((r) => r.registrationId)).toEqual(["a", "b"]);
    // Level on everything except the most recent round's place.
    board = buildLeaderboard(["a", "b"], [
      { roundNumber: 1, registrationId: "a", placement: 2, kills: 0 },
      { roundNumber: 1, registrationId: "b", placement: 3, kills: 1 },
      { roundNumber: 2, registrationId: "a", placement: 3, kills: 1 },
      { roundNumber: 2, registrationId: "b", placement: 2, kills: 0 },
    ], table);
    expect(board.map((r) => r.registrationId)).toEqual(["b", "a"]);
  });
  it("shares a rank when fully level and reports no outright winner", () => {
    const board = buildLeaderboard(["a", "b"], [], table);
    expect(board.map((r) => r.rank)).toEqual([1, 1]);
    expect(leaderboardWinner(board)).toBeNull();
  });
});

describe("groups → final", () => {
  it("parses settings and checks the final fits", async () => {
    const { parseLobbyGroups } = await import("./lobbyScoring");
    expect(parseLobbyGroups({ groups: "" }, 100, 100)).toEqual({ ok: true, value: null });
    expect(parseLobbyGroups({ groups: 4, qualifiers: 5, finalRounds: 3 }, 25, 100)).toEqual({ ok: true, value: { groups: 4, qualifiers: 5, finalRounds: 3 } });
    expect(parseLobbyGroups({ groups: 4, qualifiers: 10 }, 25, 100).ok).toBe(false); // 40 finalists > 25
    expect(parseLobbyGroups({ groups: 4, qualifiers: 5 }, 25, 101).ok).toBe(false); // 4 lobbies hold 100
    expect(parseLobbyGroups({ groups: 4, qualifiers: 5 }, 25, 20).ok).toBe(false); // 5 per group, 5 qualify
    expect(parseLobbyGroups({ groups: 1, qualifiers: 5 }, 25, 20).ok).toBe(false);
  });
  it("runs fewer groups when too few registered", async () => {
    const { effectiveGroups } = await import("./lobbyScoring");
    const config = { groups: 4, qualifiers: 5, finalRounds: 3 };
    expect(effectiveGroups(100, config)).toBe(4);
    expect(effectiveGroups(20, config)).toBe(3); // 4 groups of 5 knock nobody out; 3 of 6 do
    expect(effectiveGroups(11, config)).toBe(1);
  });
  it("deals evenly and picks qualifiers, refusing a dead tie on the line", async () => {
    const { dealGroups, qualifiersFrom, groupLetter } = await import("./lobbyScoring");
    const dealt = dealGroups(["a", "b", "c", "d", "e"], 2);
    expect([...dealt.values()]).toEqual([1, 2, 1, 2, 1]);
    expect(groupLetter(2)).toBe("B");
    const board = buildLeaderboard(["a", "b", "c", "d"], [
      { roundNumber: 1, registrationId: "a", placement: 1, kills: 0 },
      { roundNumber: 1, registrationId: "b", placement: 2, kills: 0 },
      { roundNumber: 1, registrationId: "c", placement: 3, kills: 0 },
    ], table);
    expect(qualifiersFrom(board, 2)).toEqual(["a", "b"]);
    const level = buildLeaderboard(["a", "b", "c"], [{ roundNumber: 1, registrationId: "a", placement: 1, kills: 0 }], table);
    expect(qualifiersFrom(level, 2)).toBeNull(); // b and c both didn't play: level on the line
  });
});
