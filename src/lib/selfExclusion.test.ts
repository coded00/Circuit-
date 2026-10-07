import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  MAX_SELF_EXCLUSION_DAYS,
  MIN_SELF_EXCLUSION_DAYS,
  formatSelfExclusionDate,
  isSelfExcluded,
  resolveSelfExclusion,
  selfExclusionMessage,
} from "./selfExclusion";

/**
 * The arithmetic and the one-way rule behind a cool-off, with no database
 * involved — `lockStake`'s enforcement of it is tested against real Postgres
 * in stakes.test.ts, and this file is about the date maths that decides what
 * "until" means and which direction a request is allowed to move it.
 */

const NOW = new Date("2026-10-07T12:00:00.000Z").getTime();
const at = (days: number) => new Date(NOW + days * DAY_MS);

describe("isSelfExcluded", () => {
  it("treats null, an expired date and the exact end instant as not excluded", () => {
    expect(isSelfExcluded(null, NOW)).toBe(false);
    expect(isSelfExcluded(undefined, NOW)).toBe(false);
    expect(isSelfExcluded(at(-1), NOW)).toBe(false);
    // The boundary: a cool-off ending at this very millisecond is over. One
    // millisecond later it would be a refusal, which is the test below.
    expect(isSelfExcluded(new Date(NOW), NOW)).toBe(false);
    expect(isSelfExcluded(new Date(NOW + 1), NOW)).toBe(true);
  });

  it("is in force for a date in the future", () => {
    expect(isSelfExcluded(at(3), NOW)).toBe(true);
  });
});

describe("resolveSelfExclusion", () => {
  it("refuses anything that isn't a whole number of days in range", () => {
    for (const days of [0, -1, 1.5, MAX_SELF_EXCLUSION_DAYS + 1, Number.NaN, "7", null, undefined, {}]) {
      expect(resolveSelfExclusion(null, null, days, NOW), `${String(days)} should be invalid`).toEqual({ kind: "invalid" });
    }
  });

  it("accepts both ends of the range", () => {
    expect(resolveSelfExclusion(null, null, MIN_SELF_EXCLUSION_DAYS, NOW)).toMatchObject({ kind: "set" });
    expect(resolveSelfExclusion(null, null, MAX_SELF_EXCLUSION_DAYS, NOW)).toMatchObject({ kind: "set" });
  });

  it("starts a new run when there is nothing on file", () => {
    const change = resolveSelfExclusion(null, null, 7, NOW);
    expect(change).toEqual({ kind: "set", until: at(7), startedAt: new Date(NOW) });
  });

  it("starts a new run when the previous one has expired, rather than extending it", () => {
    // "On a break since" has to mean this break. An expired cool-off that a
    // new request extended would report a start date from months ago.
    const change = resolveSelfExclusion(at(-30), at(-60), 7, NOW);
    expect(change).toEqual({ kind: "set", until: at(7), startedAt: new Date(NOW) });
  });

  it("extends a running cool-off and keeps the original start date", () => {
    const change = resolveSelfExclusion(at(3), at(-10), 30, NOW);
    expect(change).toEqual({ kind: "extend", until: at(30), startedAt: at(-10) });
  });

  it("falls back to now for the start if an active cool-off has no recorded start", () => {
    // Only reachable from a row written before `selfExcludedAt` existed, but
    // an undefined date in the UI is worse than a slightly late one.
    const change = resolveSelfExclusion(at(3), null, 30, NOW);
    expect(change).toEqual({ kind: "extend", until: at(30), startedAt: new Date(NOW) });
  });

  it("refuses to shorten a running cool-off, and reports the date already on file", () => {
    const change = resolveSelfExclusion(at(30), at(-1), 7, NOW);
    expect(change).toEqual({ kind: "shorten", until: at(30) });
  });

  it("treats an extension to the same instant as a shortening", () => {
    // Asking for the same number of days again lands on the same end date,
    // which is not further out than what is on file — so it is refused, the
    // same as any other no-op-to-earlier request. Allowing it would mean the
    // rule is "later or equal", and equal is a value a caller can pad with.
    const change = resolveSelfExclusion(at(7), new Date(NOW), 7, NOW);
    expect(change).toEqual({ kind: "shorten", until: at(7) });
  });
});

describe("formatSelfExclusionDate", () => {
  it("shows the date in West Africa Time, which is the day the player experiences", () => {
    // 23:30 UTC on the 7th is 00:30 on the 8th in Lagos. Formatted in UTC this
    // reads "7 October" — a cool-off that appears to end a day before it does,
    // to someone who will try to stake that evening and be refused.
    expect(formatSelfExclusionDate(new Date("2026-10-07T23:30:00.000Z"))).toBe("8 October 2026");
    expect(formatSelfExclusionDate(new Date("2026-10-07T22:30:00.000Z"))).toBe("7 October 2026");
  });

  it("appears in the refusal message, so the player is told when it lifts", () => {
    expect(selfExclusionMessage(new Date("2026-11-01T09:00:00.000Z"))).toBe(
      "You've paused staked Battles until 1 November 2026. You can still play free Battles."
    );
  });
});
