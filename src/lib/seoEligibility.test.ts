import { describe, expect, it } from "vitest";
import { gameIsIndexable, leaderboardIsIndexable, teamIsIndexable } from "@/lib/seoEligibility";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";

describe("indexing thresholds", () => {
  it("indexes a game with three public tournaments or one finished tournament with eight entrants", () => {
    expect(gameIsIndexable({ publicTournaments: 3, completedWithEightEntrants: 0 })).toBe(true);
    expect(gameIsIndexable({ publicTournaments: 1, completedWithEightEntrants: 1 })).toBe(true);
    expect(gameIsIndexable({ publicTournaments: 2, completedWithEightEntrants: 0 })).toBe(false);
  });
  it("indexes a leaderboard from ten ranked players", () => {
    expect(leaderboardIsIndexable(9)).toBe(false);
    expect(leaderboardIsIndexable(10)).toBe(true);
  });
  it("indexes a team with two members and a tournament entry", () => {
    expect(teamIsIndexable({ acceptedMembers: 2, tournamentEntries: 1 })).toBe(true);
    expect(teamIsIndexable({ acceptedMembers: 1, tournamentEntries: 3 })).toBe(false);
    expect(teamIsIndexable({ acceptedMembers: 5, tournamentEntries: 0 })).toBe(false);
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers each step and makes the addresses absolute", () => {
    const ld = breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Games", path: "/games/x" }]);
    expect(ld.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(ld.itemListElement[1].item).toMatch(/^https?:\/\/.+\/games\/x$/);
  });
});
