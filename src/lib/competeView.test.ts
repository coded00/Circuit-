import { describe, it, expect } from "vitest";
import { competitionKind, formatsForType, pickFeatured, spotsLabel, timeUntil } from "./competeView";

const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

describe("competitionKind", () => {
  it("names the structure, and says when a league is home and away", () => {
    expect(competitionKind({ format: "KNOCKOUT" })).toBe("Single elimination");
    expect(competitionKind({ format: "LEAGUE", leagueLegs: 1 })).toBe("League");
    expect(competitionKind({ format: "LEAGUE", leagueLegs: 2 })).toBe("League, home and away");
  });
});

describe("formatsForType", () => {
  it("groups structures the way players think of them", () => {
    expect(formatsForType("bracket")).toContain("DOUBLE_ELIMINATION");
    expect(formatsForType("table")).toEqual(expect.arrayContaining(["LEAGUE", "ROUND_ROBIN", "SWISS"]));
    expect(formatsForType("nope")).toBeNull();
    expect(formatsForType(undefined)).toBeNull();
  });
});

describe("timeUntil", () => {
  const at = (ms: number) => new Date(NOW + ms);
  it("speaks in days, hours and minutes, and flags the last day as urgent", () => {
    expect(timeUntil(at(3 * 86_400_000 + 5), NOW)).toEqual({ text: "3 days", urgent: false });
    expect(timeUntil(at(30 * 3_600_000), NOW)).toEqual({ text: "1 day", urgent: false });
    expect(timeUntil(at(5 * 3_600_000), NOW)).toEqual({ text: "5 hours", urgent: true });
    expect(timeUntil(at(20 * 60_000), NOW)).toEqual({ text: "20 minutes", urgent: true });
  });
  it("is null once the time has passed", () => {
    expect(timeUntil(at(-1000), NOW)).toBeNull();
  });
});

describe("pickFeatured", () => {
  const t = (id: string, status: string, prize: number | null, startsInDays: number, registered = 0) => ({ id, status, prizeAmount: prize, startAt: new Date(NOW + startsInDays * 86_400_000), registered });
  it("leads with the busiest live competition", () => {
    expect(pickFeatured([t("a", "OPEN", 900_000, 1), t("b", "LIVE", null, -1, 3), t("c", "LIVE", null, -2, 8)])!.id).toBe("c");
  });
  it("otherwise the open one with the biggest prize, soonest on a tie", () => {
    expect(pickFeatured([t("a", "OPEN", 200_000, 1), t("b", "OPEN", 500_000, 5), t("c", "OPEN", 500_000, 2), t("d", "COMPLETE", 900_000, -3)])!.id).toBe("c");
  });
  it("is null when nothing is open or live", () => {
    expect(pickFeatured([t("d", "COMPLETE", 900_000, -3)])).toBeNull();
  });
});

describe("spotsLabel", () => {
  it("says how many spots are left and when it's getting tight", () => {
    expect(spotsLabel(3, 16)).toEqual({ text: "13 spots left", tight: false });
    expect(spotsLabel(14, 16)).toEqual({ text: "2 spots left", tight: true });
    expect(spotsLabel(15, 16)).toEqual({ text: "Last spot", tight: true });
    expect(spotsLabel(16, 16)).toEqual({ text: "Full", tight: true });
  });
});
