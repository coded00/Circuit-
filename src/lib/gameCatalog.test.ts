import { describe, expect, it } from "vitest";
import { describeEntry, describeMatch, entriesPerMatch, parseFormatInput, parseGameInput, parseModeInput, publishBlocker } from "./gameCatalog";

describe("parseFormatInput", () => {
  it("forces one player for individual formats and two sides for head-to-head", () => {
    const r = parseFormatInput({ name: "1v1", entryType: "INDIVIDUAL", playersPerTeam: 5, structures: ["KNOCKOUT"] }, "HEAD_TO_HEAD");
    expect(r.ok && r.value).toMatchObject({ playersPerTeam: 1, teamsPerMatch: 2, maxPlayersPerMatch: null });
  });

  it("accepts a battle royale squad with a lobby cap and no fixed team count", () => {
    const r = parseFormatInput(
      { name: "Squad", entryType: "TEAM", playersPerTeam: 4, maxPlayersPerMatch: 100, structures: ["LOBBY_POINTS", "KNOCKOUT"] },
      "LOBBY"
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ teamsPerMatch: null, maxPlayersPerMatch: 100, structures: ["LOBBY_POINTS"] });
    expect(entriesPerMatch(r.value)).toBe(25);
  });

  it("requires a lobby cap for lobby modes", () => {
    const r = parseFormatInput({ name: "Solo", entryType: "INDIVIDUAL", structures: ["LOBBY_POINTS"] }, "LOBBY");
    expect(r.ok).toBe(false);
  });

  it("rejects a lobby team count that overflows the player cap", () => {
    const r = parseFormatInput(
      { name: "Squad", entryType: "TEAM", playersPerTeam: 4, teamsPerMatch: 30, maxPlayersPerMatch: 100, structures: ["LOBBY_POINTS"] },
      "LOBBY"
    );
    expect(r.ok).toBe(false);
  });

  it("stores roster bounds only when they differ from the playing size", () => {
    const exact = parseFormatInput({ name: "5v5", entryType: "TEAM", playersPerTeam: 5, minRoster: 5, maxRoster: 5, structures: ["KNOCKOUT"] }, "HEAD_TO_HEAD");
    expect(exact.ok && exact.value).toMatchObject({ minRoster: null, maxRoster: null });
    const subs = parseFormatInput({ name: "5v5", entryType: "TEAM", playersPerTeam: 5, maxRoster: 7, structures: ["KNOCKOUT"] }, "HEAD_TO_HEAD");
    expect(subs.ok && subs.value).toMatchObject({ minRoster: null, maxRoster: 7 });
    const bad = parseFormatInput({ name: "5v5", entryType: "TEAM", playersPerTeam: 5, maxRoster: 3, structures: ["KNOCKOUT"] }, "HEAD_TO_HEAD");
    expect(bad.ok).toBe(false);
  });

  it("requires a structure that matches the mode's style", () => {
    const r = parseFormatInput({ name: "5v5", entryType: "TEAM", playersPerTeam: 5, structures: ["LOBBY_POINTS"] }, "HEAD_TO_HEAD");
    expect(r.ok).toBe(false);
  });

  it("rejects one-player team formats", () => {
    expect(parseFormatInput({ name: "x", entryType: "TEAM", playersPerTeam: 1, structures: ["KNOCKOUT"] }, "HEAD_TO_HEAD").ok).toBe(false);
  });
});

describe("parse game/mode", () => {
  it("requires names and dedupes platforms", () => {
    expect(parseGameInput({ name: "  " }).ok).toBe(false);
    const g = parseGameInput({ name: "PUBG Mobile", platforms: ["Mobile", "Mobile", " ", "PC"] });
    expect(g.ok && g.value.platforms).toEqual(["Mobile", "PC"]);
    expect(parseModeInput({ name: "BR" }).ok).toBe(false);
  });
});

describe("summaries", () => {
  const base = { minRoster: null, maxRoster: null, teamsPerMatch: 2, maxPlayersPerMatch: null };
  it("describes entries and matches", () => {
    expect(describeEntry({ ...base, entryType: "INDIVIDUAL", playersPerTeam: 1 })).toBe("Individual · 1 player");
    expect(describeEntry({ ...base, entryType: "TEAM", playersPerTeam: 5, maxRoster: 7 })).toBe("5 players per team · up to 7 with subs");
    expect(describeMatch({ ...base, entryType: "TEAM", playersPerTeam: 5 }, "HEAD_TO_HEAD")).toBe("5v5");
    expect(describeMatch({ ...base, teamsPerMatch: null, maxPlayersPerMatch: 100, entryType: "TEAM", playersPerTeam: 4 }, "LOBBY")).toBe(
      "Up to 100 players · 25 teams per lobby"
    );
  });

  it("blocks publishing without an active mode + format", () => {
    expect(publishBlocker([])).not.toBeNull();
    expect(publishBlocker([{ enabled: true, formats: [{ enabled: false } as never] }])).not.toBeNull();
    expect(publishBlocker([{ enabled: true, formats: [{ enabled: true } as never] }])).toBeNull();
  });
});
