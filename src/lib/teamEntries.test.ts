import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));

const { describeRoster, rosterBounds } = await import("./teamEntries");

describe("rosterBounds", () => {
  it("defaults to exactly the team size", () => {
    expect(rosterBounds({ playersPerTeam: 5, minRoster: null, maxRoster: null })).toEqual({ min: 5, max: 5 });
  });
  it("uses the format's roster range (subs)", () => {
    expect(rosterBounds({ playersPerTeam: 5, minRoster: 5, maxRoster: 7 })).toEqual({ min: 5, max: 7 });
  });
  it("never lets max fall below min, or min below 1", () => {
    expect(rosterBounds({ playersPerTeam: 4, minRoster: 6, maxRoster: 3 })).toEqual({ min: 6, max: 6 });
    expect(rosterBounds({ playersPerTeam: 0, minRoster: 0, maxRoster: null })).toEqual({ min: 1, max: 1 });
  });
});

describe("describeRoster", () => {
  it("reads naturally", () => {
    expect(describeRoster({ min: 5, max: 5 })).toBe("5 players");
    expect(describeRoster({ min: 5, max: 7 })).toBe("5–7 players");
  });
});
