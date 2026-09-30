import { describe, it, expect } from "vitest";
import { formatStake, pickBiggestPurse, potOf, timeAgo } from "./challengeView";

describe("formatStake", () => {
  it("shows whole naira and shortens millions", () => {
    expect(formatStake(500_000)).toBe("₦5,000");
    expect(formatStake(12_000_000)).toBe("₦120,000");
    expect(formatStake(150_000_000)).toBe("₦1.5M");
    expect(formatStake(300_000_000)).toBe("₦3M");
    expect(formatStake(0)).toBe("₦0");
  });
});

describe("potOf", () => {
  it("is both stakes together", () => expect(potOf(500_000)).toBe(1_000_000));
});

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

describe("pickBiggestPurse", () => {
  const b = (id: string, stake: number, minsOld: number) => ({ id, stakeAmount: stake, createdAt: new Date(1_000_000_000_000 - minsOld * 60_000) });
  it("picks the biggest stake, newest on a tie", () => {
    expect(pickBiggestPurse([b("a", 100, 5), b("b", 900, 9), b("c", 900, 2)])!.id).toBe("c");
  });
  it("needs a real stake and enough challenges for one to stand out", () => {
    expect(pickBiggestPurse([b("a", 0, 1), b("b", 0, 2), b("c", 0, 3)])).toBeNull();
    expect(pickBiggestPurse([b("a", 900, 1), b("b", 100, 2)])).toBeNull();
  });
});
