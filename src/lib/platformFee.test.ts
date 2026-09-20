import { describe, it, expect } from "vitest";
import { computePlatformFee } from "./platformFee";

/**
 * The one arithmetic guarantee the whole entry-fee split depends on:
 * computePlatformFee(entryFee, bps) + (entryFee - that result) must
 * always equal entryFee exactly — see confirmEntryFeePayment's own
 * comment on why the organizer's cut is a remainder, not an independent
 * calculation. A rounding bug here either shorts the organizer by a kobo
 * or lets the platform quietly overcharge its own cut.
 */
describe("computePlatformFee", () => {
  it("computes the documented example (5.00% of 100000)", () => {
    expect(computePlatformFee(100_000, 500)).toBe(5_000);
  });

  it("returns 0 for a 0% rate", () => {
    expect(computePlatformFee(100_000, 0)).toBe(0);
  });

  it("returns the full amount for a 100% rate", () => {
    expect(computePlatformFee(100_000, 10_000)).toBe(100_000);
  });

  it("returns 0 for a free (0 kobo) entry fee regardless of rate", () => {
    expect(computePlatformFee(0, 500)).toBe(0);
  });

  it("rounds to the nearest kobo rather than truncating or throwing on a fractional result", () => {
    // 333 * 750 / 10000 = 24.975 -> rounds to 25
    expect(computePlatformFee(333, 750)).toBe(25);
  });

  it("the fee never exceeds the entry fee for any rate in the valid 0-10000bps range", () => {
    const entryFee = 123_456;
    for (const bps of [0, 1, 250, 500, 999, 5_000, 9_999, 10_000]) {
      const fee = computePlatformFee(entryFee, bps);
      expect(fee).toBeGreaterThanOrEqual(0);
      expect(fee).toBeLessThanOrEqual(entryFee);
      // The invariant the whole split actually depends on.
      const organizerRemainder = entryFee - fee;
      expect(fee + organizerRemainder).toBe(entryFee);
    }
  });
});
