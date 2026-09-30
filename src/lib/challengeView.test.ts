import { describe, it, expect } from "vitest";
import { potOf, recordKey, timeAgo, winRate } from "./challengeView";

describe("timeAgo", () => {
  const now = Date.UTC(2026, 9, 1, 12, 0, 0);
  const ago = (ms: number) => new Date(now - ms);
  it("reads naturally at each scale", () => {
    expect(timeAgo(ago(20_000), now)).toBe("just now");
    expect(timeAgo(ago(3 * 60_000), now)).toBe("3 min ago");
    expect(timeAgo(ago(2 * 3_600_000 + 1000), now)).toBe("2 hr ago");
    expect(timeAgo(ago(26 * 3_600_000), now)).toBe("1 day ago");
    expect(timeAgo(ago(4 * 86_400_000), now)).toBe("4 days ago");
    expect(timeAgo(ago(-5000), now)).toBe("just now");
  });
});

describe("potOf", () => {
  it("is both stakes together", () => expect(potOf(500_000)).toBe(1_000_000));
});

describe("winRate", () => {
  it("rounds to a whole percent and is null with no matches", () => {
    expect(winRate(18, 6)).toBe(75);
    expect(winRate(41, 9)).toBe(82);
    expect(winRate(1, 2)).toBe(33);
    expect(winRate(0, 0)).toBeNull();
    expect(winRate(0, 4)).toBe(0);
  });
});

describe("recordKey", () => {
  it("separates the same player across games", () => expect(recordKey("CODM", "u1")).not.toBe(recordKey("EA FC", "u1")));
});
