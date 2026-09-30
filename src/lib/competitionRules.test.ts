import { describe, expect, it } from "vitest";
import { competitionLabel, formatUnavailable, structureOptions } from "./competitionRules";

describe("formatUnavailable", () => {
  it("allows individual head-to-head formats with a runnable structure", () => {
    expect(formatUnavailable("HEAD_TO_HEAD", { entryType: "INDIVIDUAL", structures: ["KNOCKOUT"] })).toBeNull();
  });
  it("blocks lobby modes until lobby scoring exists", () => {
    expect(formatUnavailable("LOBBY", { entryType: "INDIVIDUAL", structures: ["LOBBY_POINTS"] })).toBeNull();
  });
  it("allows team formats now that team entries exist", () => {
    expect(formatUnavailable("HEAD_TO_HEAD", { entryType: "TEAM", structures: ["KNOCKOUT"] })).toBeNull();
  });
  it("blocks formats that only offer structures without an engine", () => {
    // Every structure in the registry has an engine now, so use one the registry doesn't know.
    expect(formatUnavailable("HEAD_TO_HEAD", { entryType: "INDIVIDUAL", structures: ["NOT_A_REAL_STRUCTURE"] })).toBe("STRUCTURE");
    expect(formatUnavailable("HEAD_TO_HEAD", { entryType: "INDIVIDUAL", structures: ["LEAGUE"] })).toBeNull();
  });
});

describe("structureOptions", () => {
  it("lists a format's structures in registry order with runnability", () => {
    expect(structureOptions({ structures: ["LEAGUE", "SWISS", "KNOCKOUT"] }).map((s) => [s.id, s.runnable])).toEqual([
      ["KNOCKOUT", true],
      ["SWISS", true],
      ["LEAGUE", true],
    ]);
  });
});

describe("competitionLabel", () => {
  it("joins mode and format, or uses the mode alone for modes without formats", () => {
    expect(competitionLabel("Search & Destroy", { name: "1v1", isDefault: false })).toBe("Search & Destroy · 1v1");
    expect(competitionLabel("Head-to-Head", { name: "Head-to-Head", isDefault: true })).toBe("Head-to-Head");
  });
});
