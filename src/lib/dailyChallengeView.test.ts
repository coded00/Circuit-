import { describe, expect, it } from "vitest";
import { cardTimeLine, isFeedActive, nextDeadline, playerStage, prizeSummary, shortWhen } from "@/lib/dailyChallengeView";

const T0 = new Date("2026-11-01T10:00:00Z");
const at = (m: number) => new Date(T0.getTime() + m * 60_000);
const base = { status: "OPEN" as const, pausedAt: null, entryOpensAt: at(0), entryClosesAt: at(60), windowStartsAt: at(90), windowEndsAt: at(150), submissionsCloseAt: at(180) };

describe("playerStage", () => {
  it("says what a player can do, following the clock when the sweep hasn't caught up", () => {
    expect(playerStage(base, at(10)).label).toBe("Open for entries");
    expect(playerStage(base, at(60)).label).toBe("Entries closed");
    expect(playerStage(base, at(90)).label).toBe("Live");
    expect(playerStage({ ...base, status: "SCHEDULED" }, at(-5)).label).toBe("Opens soon");
  });

  it("calls review, provisional and final results by what they mean to a player", () => {
    expect(playerStage({ ...base, status: "UNDER_REVIEW" }).label).toBe("Being reviewed");
    expect(playerStage({ ...base, status: "PROVISIONAL" }).label).toBe("Provisional results");
    expect(playerStage({ ...base, status: "SETTLING" }).label).toBe("Results final");
    expect(playerStage({ ...base, status: "CANCELLED" }).tone).toBe("cancelled");
  });

  it("shows a pause over anything but a cancellation", () => {
    expect(playerStage({ ...base, pausedAt: at(5) }, at(10)).label).toBe("Paused");
    expect(playerStage({ ...base, status: "CANCELLED", pausedAt: at(5) }).label).toBe("Cancelled");
  });
});

describe("nextDeadline", () => {
  it("counts down to the thing that matters now, then the next", () => {
    expect(nextDeadline({ ...base, status: "SCHEDULED" }, at(-5))).toEqual({ label: "Entries open in", at: at(0) });
    expect(nextDeadline(base, at(10))).toEqual({ label: "Entries close in", at: at(60) });
    expect(nextDeadline(base, at(70))).toEqual({ label: "Match window opens in", at: at(90) });
    expect(nextDeadline({ ...base, status: "LIVE" }, at(100))).toEqual({ label: "Match window closes in", at: at(150) });
    expect(nextDeadline({ ...base, status: "LIVE" }, at(160))).toEqual({ label: "Submit your score within", at: at(180) });
  });

  it("stops counting when paused or once nothing is ticking", () => {
    expect(nextDeadline({ ...base, pausedAt: at(5) }, at(10))).toBeNull();
    expect(nextDeadline({ ...base, status: "LIVE" }, at(181))).toBeNull();
    expect(nextDeadline({ ...base, status: "PROVISIONAL" }, at(10))).toBeNull();
  });
});

describe("isFeedActive", () => {
  it("is true only while a player can still enter or play", () => {
    for (const s of ["SCHEDULED", "OPEN", "LIVE"] as const) expect(isFeedActive(s)).toBe(true);
    for (const s of ["DRAFT", "UNDER_REVIEW", "PROVISIONAL", "COMPLETED", "CANCELLED"] as const) expect(isFeedActive(s)).toBe(false);
  });
});

describe("shortWhen", () => {
  // Lagos is UTC+1. 12:00 UTC on 2 Nov 2026 (a Monday) is 13:00 in Lagos.
  const now = new Date("2026-11-02T12:00:00Z");
  it("says today, tomorrow and yesterday, then the weekday, then the date", () => {
    expect(shortWhen(new Date("2026-11-02T17:15:00Z"), now)).toBe("Today 18:15");
    expect(shortWhen(new Date("2026-11-03T05:00:00Z"), now)).toBe("Tomorrow 06:00");
    expect(shortWhen(new Date("2026-11-01T20:00:00Z"), now)).toBe("Yesterday 21:00");
    expect(shortWhen(new Date("2026-11-06T17:15:00Z"), now)).toBe("Fri 18:15");
    expect(shortWhen(new Date("2026-11-20T17:15:00Z"), now)).toBe("20 Nov 18:15");
  });

  it("uses the Lagos day, not the UTC one, around midnight", () => {
    // 23:30 UTC on the 2nd is 00:30 on the 3rd in Lagos: "Tomorrow" from a 13:00 Lagos afternoon on the 2nd.
    expect(shortWhen(new Date("2026-11-02T23:30:00Z"), now)).toBe("Tomorrow 00:30");
  });
});

describe("cardTimeLine", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  const c = { status: "OPEN" as const, pausedAt: null, entryOpensAt: new Date("2026-11-02T05:00:00Z"), entryClosesAt: new Date("2026-11-02T17:00:00Z"), windowStartsAt: new Date("2026-11-02T17:00:00Z"), windowEndsAt: new Date("2026-11-02T21:00:00Z"), submissionsCloseAt: new Date("2026-11-02T22:00:00Z") };

  it("names the deadline that matters now, in the order they come", () => {
    expect(cardTimeLine({ ...c, status: "SCHEDULED" }, new Date("2026-11-02T04:00:00Z"))).toBe("Opens Today 06:00");
    expect(cardTimeLine(c, now)).toBe("Entries close Today 18:00");
    expect(cardTimeLine({ ...c, status: "LIVE" }, new Date("2026-11-02T18:00:00Z"))).toBe("Match window closes Today 22:00");
    expect(cardTimeLine({ ...c, status: "LIVE" }, new Date("2026-11-02T21:30:00Z"))).toBe("Submit by Today 23:00");
    expect(cardTimeLine({ ...c, status: "LIVE" }, new Date("2026-11-02T22:30:00Z"))).toBe("Waiting for review");
  });

  it("says where a finished challenge is, and nothing misleading", () => {
    expect(cardTimeLine({ ...c, status: "UNDER_REVIEW" }, now)).toBe("Staff are checking scores");
    expect(cardTimeLine({ ...c, status: "PROVISIONAL" }, now)).toMatch(/disputes/);
    expect(cardTimeLine({ ...c, status: "COMPLETED" }, now)).toBe("Settled");
    expect(cardTimeLine({ ...c, status: "CANCELLED" }, now)).toBe("Cancelled");
    expect(cardTimeLine({ ...c, pausedAt: now }, now)).toBe("Paused");
  });
});

describe("prizeSummary", () => {
  const base = { categoryPrizeTotal: null, entryFee: 100_000, platformFeeBps: 1000, maxEntrants: 20, entered: 0, sponsorKobo: 0 };

  it("shows fixed prize categories as a total, or nothing when there are none worth showing", () => {
    expect(prizeSummary({ ...base, categoryPrizeTotal: 1_400_000 })).toEqual({ label: "Prizes", kobo: 1_400_000 });
    expect(prizeSummary({ ...base, categoryPrizeTotal: 0 })).toEqual({ label: "Prize", kobo: null });
  });

  it("shows a pool as 'up to' the full field until somebody enters, then as what is in it", () => {
    expect(prizeSummary(base)).toEqual({ label: "Prize pool up to", kobo: 1_800_000 });
    expect(prizeSummary({ ...base, entered: 5 })).toEqual({ label: "Prize pool", kobo: 450_000 });
  });

  it("has no cash prize for a free challenge with no sponsor, and has one with a sponsor", () => {
    expect(prizeSummary({ ...base, entryFee: 0 })).toEqual({ label: "Prize", kobo: null });
    expect(prizeSummary({ ...base, entryFee: 0, sponsorKobo: 500_000 })).toEqual({ label: "Prize pool up to", kobo: 500_000 });
  });
});
