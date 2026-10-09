import { describe, expect, it } from "vitest";
import { sponsorshipRefusal, sponsorshipShortfall } from "@/lib/sponsorship";

/**
 * The rule that stands between a sponsored prize and Circuit's balance: a payout taking money from the
 * platform needs a recorded statement of where that money is coming from, covering the whole amount.
 *
 * Two things this file is really guarding. The first is the ordinary tournament — most tournaments pay for
 * themselves, so `unbackedAmount` is 0 and the rule has to say nothing at all; a rule that refuses those
 * would stop every payout on the platform. The second is the boundary: a record that covers the amount
 * exactly must pass, and a record one kobo short must not. "Covered" meaning "at least" is the whole rule,
 * and `<` written as `<=` would silently require a rounding-up that no one would think to do.
 */

const record = (amountKobo: number, source = "Q3 marketing budget") => ({ amountKobo, source });

describe("sponsorshipShortfall", () => {
  it("is 0 for a payout that didn't touch Circuit's balance, with or without a record", () => {
    // The ordinary case, and the most important one: a tournament whose entry fees covered its prize is
    // unaffected by any of this, even though it has no sponsorship and never will.
    expect(sponsorshipShortfall({ unbackedAmount: 0, sponsorship: null })).toBe(0);
    expect(sponsorshipShortfall({ unbackedAmount: 0, sponsorship: record(100) })).toBe(0);
    // Nothing about a refund, a negative, or a rounding artefact should ever invert and demand money.
    expect(sponsorshipShortfall({ unbackedAmount: -1, sponsorship: null })).toBe(0);
  });

  it("is the whole unbacked amount when nothing is recorded", () => {
    expect(sponsorshipShortfall({ unbackedAmount: 50_000, sponsorship: null })).toBe(50_000);
  });

  it("is 0 when the record covers the amount exactly — and not when it is one kobo short", () => {
    expect(sponsorshipShortfall({ unbackedAmount: 50_000, sponsorship: record(50_000) })).toBe(0);
    expect(sponsorshipShortfall({ unbackedAmount: 50_001, sponsorship: record(50_000) })).toBe(1);
  });

  it("is 0 when the record covers more than the amount", () => {
    // Over-covering is the normal way to be safe: a sponsor's money is recorded once and a later prize
    // turns out smaller. That must approve, not look like a mismatch.
    expect(sponsorshipShortfall({ unbackedAmount: 50_000, sponsorship: record(5_000_000) })).toBe(0);
  });
});

describe("sponsorshipRefusal", () => {
  it("says nothing about a payout that isn't taking platform money", () => {
    expect(sponsorshipRefusal({ unbackedAmount: 0, sponsorship: null })).toBeNull();
    expect(sponsorshipRefusal({ unbackedAmount: 0, sponsorship: record(50_000) })).toBeNull();
  });

  it("says nothing when the record covers the amount", () => {
    expect(sponsorshipRefusal({ unbackedAmount: 50_000, sponsorship: record(50_000) })).toBeNull();
  });

  it("asks for a record when there is none", () => {
    const message = sponsorshipRefusal({ unbackedAmount: 50_000, sponsorship: null });
    expect(message).toMatch(/Circuit's own balance/);
    expect(message).toMatch(/Record the sponsorship/);
    // It has to be a sentence someone can act on without reading the code — naming the amount is what
    // makes it actionable rather than a generic refusal.
    expect(message).toMatch(/₦500/);
  });

  it("names the shortfall when the record is too small to cover it", () => {
    // The two numbers are the point: an approver being told only "there is a shortfall" has to go and work
    // out which of the two figures is wrong, and the one that is usually wrong is the record.
    const message = sponsorshipRefusal({ unbackedAmount: 50_000, sponsorship: record(20_000) });
    expect(message).toMatch(/₦200/); // what the record covers
    expect(message).toMatch(/₦500/); // what the payout takes
    expect(message).toMatch(/₦300/); // what is left over
    expect(message).toMatch(/Q3 marketing budget/);
  });
});
