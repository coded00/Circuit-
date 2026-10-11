import { describe, expect, it } from "vitest";
import {
  canTransition,
  describeRequirement,
  evaluateRequirements,
  parseRequirementClaims,
  reviewRefusal,
  parseRequirements,
  targetMet,
  challengePool,
  challengePrizeShares,
  entryRefusal,
  evidenceTimingFlag,
  isCancellable,
  isEditable,
  isPausable,
  isTerminal,
  leaderboardVisible,
  nextTimedMove,
  parseChallengeInput,
  publishRefusal,
  rankEntries,
  refundableOnCancel,
  shiftOnResume,
  submitRefusal,
  withdrawRefusal,
  type ClockContext,
  type ClockFields,
} from "@/lib/dailyChallenges";
import { computePlatformFee } from "@/lib/platformFee";

/**
 * The rules that decide who is charged, who is refunded and who is paid. Pure functions, no database — the
 * point of this file is that every boundary a player's money depends on is pinned by a test: the minute a
 * deadline passes, the kobo a fee rounds to, the tie nobody is allowed to break by chance.
 */

const T0 = new Date("2026-11-01T10:00:00.000Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const clock = (over: Partial<ClockFields> = {}): ClockFields => ({
  status: "OPEN",
  pausedAt: null,
  minEntrants: 2,
  entryOpensAt: at(0),
  entryClosesAt: at(60),
  windowStartsAt: at(60),
  submissionsCloseAt: at(180),
  disputeWindowMinutes: 30,
  provisionalAt: null,
  ...over,
});
const ctx = (over: Partial<ClockContext> = {}): ClockContext => ({ activeEntryCount: 5, pendingSubmissions: 0, openDisputes: 0, ...over });

describe("lifecycle", () => {
  it("only allows the moves the spec lists", () => {
    expect(canTransition("OPEN", "LIVE")).toBe(true);
    expect(canTransition("OPEN", "PROVISIONAL")).toBe(false);
    expect(canTransition("LIVE", "OPEN")).toBe(false);
    // Results can go back for more review, but nothing returns from a locked standing.
    expect(canTransition("PROVISIONAL", "UNDER_REVIEW")).toBe(true);
    expect(canTransition("FINALIZED", "PROVISIONAL")).toBe(false);
  });

  it("cannot be cancelled once the standings are locked, or twice", () => {
    expect(isCancellable("OPEN")).toBe(true);
    expect(isCancellable("PROVISIONAL")).toBe(true);
    expect(isCancellable("FINALIZED")).toBe(false);
    expect(isCancellable("SETTLING")).toBe(false);
    expect(isCancellable("CANCELLED")).toBe(false);
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("FINALIZED")).toBe(false);
  });

  it("keeps scores hidden until staff have verified them", () => {
    for (const s of ["DRAFT", "SCHEDULED", "OPEN", "LIVE", "SUBMISSIONS_CLOSED", "UNDER_REVIEW", "CANCELLED"] as const) {
      expect(leaderboardVisible(s)).toBe(false);
    }
    for (const s of ["PROVISIONAL", "FINALIZED", "SETTLING", "COMPLETED"] as const) expect(leaderboardVisible(s)).toBe(true);
  });
});

describe("nextTimedMove", () => {
  it("opens a scheduled challenge exactly when entries open, not a moment before", () => {
    expect(nextTimedMove(clock({ status: "SCHEDULED" }), ctx(), at(-1))).toBeNull();
    expect(nextTimedMove(clock({ status: "SCHEDULED" }), ctx(), at(0))).toEqual({ to: "OPEN" });
  });

  it("goes live when the window starts if enough players entered", () => {
    expect(nextTimedMove(clock(), ctx(), at(59))).toBeNull();
    expect(nextTimedMove(clock(), ctx(), at(60))).toEqual({ to: "LIVE" });
  });

  it("cancels, with the refund reason, the moment entries close short of the minimum", () => {
    const move = nextTimedMove(clock({ minEntrants: 3 }), ctx({ activeEntryCount: 2 }), at(60));
    expect(move?.to).toBe("CANCELLED");
    expect(move?.reason).toMatch(/refunded/);
    // Exactly the minimum is enough.
    expect(nextTimedMove(clock({ minEntrants: 3 }), ctx({ activeEntryCount: 3 }), at(60))).toEqual({ to: "LIVE" });
  });

  it("does not cancel for a thin field while entries are still open", () => {
    // Closing and window start are the same instant here, so open the gap: entries close at 30, window at 60.
    const c = clock({ minEntrants: 3, entryClosesAt: at(30) });
    expect(nextTimedMove(c, ctx({ activeEntryCount: 1 }), at(29))).toBeNull();
    expect(nextTimedMove(c, ctx({ activeEntryCount: 1 }), at(30))?.to).toBe("CANCELLED");
  });

  it("closes submissions at the deadline and moves straight on to review", () => {
    expect(nextTimedMove(clock({ status: "LIVE" }), ctx(), at(179))).toBeNull();
    expect(nextTimedMove(clock({ status: "LIVE" }), ctx(), at(180))).toEqual({ to: "SUBMISSIONS_CLOSED" });
    expect(nextTimedMove(clock({ status: "SUBMISSIONS_CLOSED" }), ctx(), at(181))).toEqual({ to: "UNDER_REVIEW" });
  });

  it("publishes provisional results only once nothing is waiting on a reviewer", () => {
    expect(nextTimedMove(clock({ status: "UNDER_REVIEW" }), ctx({ pendingSubmissions: 1 }), at(300))).toBeNull();
    expect(nextTimedMove(clock({ status: "UNDER_REVIEW" }), ctx({ pendingSubmissions: 0 }), at(300))).toEqual({ to: "PROVISIONAL" });
  });

  it("finalizes after the dispute window, and never while a dispute is open", () => {
    const c = clock({ status: "PROVISIONAL", provisionalAt: at(200), disputeWindowMinutes: 30 });
    expect(nextTimedMove(c, ctx(), at(229))).toBeNull();
    expect(nextTimedMove(c, ctx(), at(230))).toEqual({ to: "FINALIZED" });
    expect(nextTimedMove(c, ctx({ openDisputes: 1 }), at(1000))).toBeNull();
    // Without a recorded provisional time there is no window to measure, so it waits rather than guessing.
    expect(nextTimedMove(clock({ status: "PROVISIONAL", provisionalAt: null }), ctx(), at(1000))).toBeNull();
  });

  it("does not move a paused challenge, and never moves money states by the clock", () => {
    expect(nextTimedMove(clock({ pausedAt: at(10) }), ctx(), at(500))).toBeNull();
    for (const status of ["FINALIZED", "SETTLING", "COMPLETED", "CANCELLED", "DRAFT"] as const) {
      expect(nextTimedMove(clock({ status }), ctx(), at(9999))).toBeNull();
    }
  });
});

describe("challengePool", () => {
  it("matches the worked example: 20 players at ₦1,000, 15% to the platform", () => {
    const pool = challengePool({ entryFee: 100_000, platformFeeBps: 1500, entryCount: 20 });
    expect(pool).toEqual({ gross: 2_000_000, platformFee: 300_000, entryPool: 1_700_000, sponsor: 0, prizePool: 1_700_000 });
  });

  it("rounds the platform's cut per entry, exactly as each ledger row will be written", () => {
    // 5% of 10,030 kobo is 501.5 → 502 per entry. Three entries are 1,506, not the 1,504.5 → 1,505 a single
    // calculation on the total would give; the ledger sums the per-entry rows, so the pool has to as well.
    const pool = challengePool({ entryFee: 10_030, platformFeeBps: 500, entryCount: 3 });
    expect(computePlatformFee(10_030, 500)).toBe(502);
    expect(pool.platformFee).toBe(1_506);
    expect(pool.gross - pool.platformFee).toBe(pool.entryPool);
  });

  it("adds a sponsor on top, and a free challenge with a sponsor still has a prize", () => {
    expect(challengePool({ entryFee: 100_000, platformFeeBps: 1500, entryCount: 4, sponsorKobo: 500_000 }).prizePool).toBe(340_000 + 500_000);
    const free = challengePool({ entryFee: 0, platformFeeBps: 1500, entryCount: 30, sponsorKobo: 1_000_000 });
    expect(free).toMatchObject({ gross: 0, platformFee: 0, prizePool: 1_000_000 });
  });

  it("never goes negative or fractional on odd input", () => {
    expect(challengePool({ entryFee: -5, platformFeeBps: 500, entryCount: -2 })).toEqual({ gross: 0, platformFee: 0, entryPool: 0, sponsor: 0, prizePool: 0 });
    expect(challengePool({ entryFee: 100, platformFeeBps: 500, entryCount: 2.9 }).gross).toBe(200);
  });
});

describe("rankEntries", () => {
  const higher = { direction: "HIGHER" as const, tiebreakDirection: null };

  it("ranks higher scores first when higher wins, lower first for a time", () => {
    const entries = [
      { userId: "a", score: 10 },
      { userId: "b", score: 25 },
      { userId: "c", score: 18 },
    ];
    expect(rankEntries(entries, higher).map((g) => g.userIds)).toEqual([["b"], ["c"], ["a"]]);
    expect(rankEntries(entries, { direction: "LOWER", tiebreakDirection: null }).map((g) => g.userIds)).toEqual([["a"], ["c"], ["b"]]);
  });

  it("uses the secondary stat only to separate entries level on the primary", () => {
    const entries = [
      { userId: "a", score: 20, tiebreakScore: 3 },
      { userId: "b", score: 20, tiebreakScore: 9 },
      { userId: "c", score: 21, tiebreakScore: 0 },
    ];
    expect(rankEntries(entries, { direction: "HIGHER", tiebreakDirection: "HIGHER" }).map((g) => g.userIds)).toEqual([["c"], ["b"], ["a"]]);
    expect(rankEntries(entries, { direction: "HIGHER", tiebreakDirection: "LOWER" }).map((g) => g.userIds)).toEqual([["c"], ["a"], ["b"]]);
  });

  it("keeps entries that are level on everything in one group — never breaks a tie by chance", () => {
    const entries = [
      { userId: "z", score: 20, tiebreakScore: 5 },
      { userId: "a", score: 20, tiebreakScore: 5 },
      { userId: "m", score: 12, tiebreakScore: 5 },
    ];
    const groups = rankEntries(entries, { direction: "HIGHER", tiebreakDirection: "HIGHER" });
    expect(groups).toHaveLength(2);
    expect([...groups[0].userIds].sort()).toEqual(["a", "z"]);
    expect(groups[1].userIds).toEqual(["m"]);
  });

  it("ignores the secondary stat when the challenge has none", () => {
    const entries = [
      { userId: "a", score: 20, tiebreakScore: 1 },
      { userId: "b", score: 20, tiebreakScore: 99 },
    ];
    expect(rankEntries(entries, higher)).toHaveLength(1);
  });

  it("treats a missing secondary stat as worse than any number", () => {
    const entries = [
      { userId: "a", score: 20, tiebreakScore: null },
      { userId: "b", score: 20, tiebreakScore: 0 },
    ];
    expect(rankEntries(entries, { direction: "HIGHER", tiebreakDirection: "HIGHER" }).map((g) => g.userIds)).toEqual([["b"], ["a"]]);
    expect(rankEntries(entries, { direction: "HIGHER", tiebreakDirection: "LOWER" }).map((g) => g.userIds)).toEqual([["b"], ["a"]]);
    const both = [
      { userId: "a", score: 20, tiebreakScore: null },
      { userId: "b", score: 20, tiebreakScore: null },
    ];
    expect(rankEntries(both, { direction: "HIGHER", tiebreakDirection: "HIGHER" })).toHaveLength(1);
  });

  it("returns nothing for no entries", () => {
    expect(rankEntries([], higher)).toEqual([]);
  });

  it("feeds straight into prize shares: a tie for first splits first and second place between them", () => {
    const groups = rankEntries(
      [
        { userId: "a", score: 30 },
        { userId: "b", score: 30 },
        { userId: "c", score: 10 },
      ],
      higher,
    );
    const shares = challengePrizeShares(1_000_000, [60, 40], groups);
    expect(shares.map((s) => s.amount).sort()).toEqual([500_000, 500_000]);
    expect(shares.reduce((a, s) => a + s.amount, 0)).toBe(1_000_000);
    expect(shares.every((s) => s.place === 1 && s.sharedWith === 2)).toBe(true);
  });
});

describe("parseChallengeInput", () => {
  const limits = { maxEntryFeeKobo: 200_000, maxEntrants: 50 };
  const good = () => ({
    gameId: "game1",
    title: "Most kills, 5v5 Hardpoint",
    rules: "Ranked Hardpoint, any map. Default settings.",
    evidenceRequirements: "Match-end scoreboard screenshot showing your name.",
    metricLabel: "Kills",
    direction: "HIGHER",
    entryFee: 100_000,
    minEntrants: 4,
    maxEntrants: 20,
    prizeSplit: [60, 40],
    entryOpensAt: "2026-11-01T10:00:00Z",
    entryClosesAt: "2026-11-01T14:00:00Z",
    windowStartsAt: "2026-11-01T14:00:00Z",
    windowEndsAt: "2026-11-01T16:00:00Z",
    submissionsCloseAt: "2026-11-01T16:30:00Z",
  });

  it("accepts a complete challenge and fills the defaults", () => {
    const r = parseChallengeInput(good(), limits);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.disputeWindowMinutes).toBe(30);
    expect(r.value.tiebreakRule).toMatch(/split/);
    expect(r.value.prizeSplit).toEqual([60, 40]);
    expect(r.value.entryOpensAt).toBeInstanceOf(Date);
  });

  it("refuses a missing or oversized field, naming it", () => {
    expect(parseChallengeInput({ ...good(), title: " " }, limits)).toEqual({ ok: false, error: "Title is required." });
    expect(parseChallengeInput({ ...good(), title: "x".repeat(121) }, limits)).toMatchObject({ ok: false });
    expect(parseChallengeInput({ ...good(), rules: undefined }, limits)).toEqual({ ok: false, error: "Rules is required." });
    expect(parseChallengeInput(null, limits)).toMatchObject({ ok: false });
  });

  it("holds the fee and the field size to the pilot ceilings", () => {
    expect(parseChallengeInput({ ...good(), entryFee: 200_001 }, limits)).toMatchObject({ ok: false, error: expect.stringContaining("₦2,000") });
    expect(parseChallengeInput({ ...good(), entryFee: 200_000 }, limits).ok).toBe(true);
    expect(parseChallengeInput({ ...good(), maxEntrants: 51 }, limits).ok).toBe(false);
    expect(parseChallengeInput({ ...good(), entryFee: 1.5 }, limits).ok).toBe(false);
    expect(parseChallengeInput({ ...good(), entryFee: -1 }, limits).ok).toBe(false);
  });

  it("will not run a paid challenge for one player, but will a free one", () => {
    expect(parseChallengeInput({ ...good(), minEntrants: 1, prizeSplit: [] }, limits).ok).toBe(false);
    expect(parseChallengeInput({ ...good(), entryFee: 0, minEntrants: 1, prizeSplit: [] }, limits).ok).toBe(true);
    expect(parseChallengeInput({ ...good(), minEntrants: 21 }, limits).ok).toBe(false);
  });

  it("refuses a prize split with more places than the smallest field can fill", () => {
    const r = parseChallengeInput({ ...good(), minEntrants: 2, prizeSplit: [50, 30, 20] }, limits);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("at most 2 places") });
    expect(parseChallengeInput({ ...good(), prizeSplit: [50, 30] }, limits)).toMatchObject({ ok: false, error: expect.stringContaining("100%") });
    expect(parseChallengeInput({ ...good(), prizeSplit: [30, 70] }, limits).ok).toBe(false);
    expect(parseChallengeInput({ ...good(), prizeSplit: [] }, limits)).toMatchObject({ ok: true, value: { prizeSplit: [] } });
  });

  it("insists on an ordered timeline, and a match window that starts after entries close", () => {
    expect(parseChallengeInput({ ...good(), entryClosesAt: "2026-11-01T09:00:00Z" }, limits).ok).toBe(false);
    expect(parseChallengeInput({ ...good(), windowStartsAt: "2026-11-01T13:00:00Z" }, limits)).toMatchObject({ ok: false, error: expect.stringContaining("enter after the first match") });
    expect(parseChallengeInput({ ...good(), windowEndsAt: "2026-11-01T13:30:00Z" }, limits).ok).toBe(false);
    expect(parseChallengeInput({ ...good(), submissionsCloseAt: "2026-11-01T15:00:00Z" }, limits)).toMatchObject({ ok: false, error: expect.stringContaining("before the match window ends") });
    expect(parseChallengeInput({ ...good(), entryOpensAt: "not a date" }, limits)).toMatchObject({ ok: false, error: expect.stringContaining("Entries open") });
  });

  it("only takes HIGHER or LOWER as a direction", () => {
    expect(parseChallengeInput({ ...good(), direction: "LOWER" }, limits)).toMatchObject({ ok: true, value: { direction: "LOWER" } });
    expect(parseChallengeInput({ ...good(), direction: "up" }, limits).ok).toBe(false);
  });
});

describe("publishRefusal", () => {
  const base = { entryFee: 100_000, minEntrants: 4, prizeSplit: [60, 40], entryOpensAt: at(0), entryClosesAt: at(60) };
  const ok = { challenge: base, platformFeeBps: 1500, sponsorKobo: 0, enabled: true, now: at(-10) };

  it("lets a sound challenge through", () => {
    expect(publishRefusal(ok)).toBeNull();
  });

  it("refuses while the feature is switched off", () => {
    expect(publishRefusal({ ...ok, enabled: false })).toMatch(/switched off/);
  });

  it("refuses a challenge whose entries would already be closed", () => {
    expect(publishRefusal({ ...ok, now: at(60) })).toMatch(/already be closed/);
    expect(publishRefusal({ ...ok, now: at(59) })).toBeNull();
  });

  it("refuses a paid challenge the platform fee would swallow", () => {
    expect(publishRefusal({ ...ok, platformFeeBps: 10_000 })).toMatch(/nothing for the prize/);
  });

  it("refuses a pool too small to pay every place", () => {
    const tiny = { ...base, entryFee: 1, minEntrants: 2, prizeSplit: [60, 40] };
    expect(publishRefusal({ ...ok, challenge: tiny, platformFeeBps: 0 })).toBeNull(); // 2 kobo across 2 places
    expect(publishRefusal({ ...ok, challenge: { ...tiny, entryFee: 1 }, platformFeeBps: 5000 })).toMatch(/nothing|too small/);
  });

  it("lets a free challenge publish with no prize at all, and counts a sponsor as one", () => {
    const free = { ...base, entryFee: 0, prizeSplit: [] };
    expect(publishRefusal({ ...ok, challenge: free })).toBeNull();
    expect(publishRefusal({ ...ok, challenge: free, sponsorKobo: 500_000 })).toBeNull();
  });
});

describe("entryRefusal", () => {
  const challenge = {
    status: "OPEN" as const,
    pausedAt: null,
    entryFee: 100_000,
    maxEntrants: 3,
    entryOpensAt: at(0),
    entryClosesAt: at(60),
    windowStartsAt: at(60),
    submissionsCloseAt: at(180),
  };
  const base = { challenge, activeEntryCount: 0, alreadyEntered: false, enabled: true, maxEntryFeeKobo: 200_000, now: at(10) };

  it("lets an eligible player in", () => {
    expect(entryRefusal(base)).toBeNull();
  });

  it("refuses when the platform switch is off, and when paused", () => {
    expect(entryRefusal({ ...base, enabled: false })?.code).toBe("DISABLED");
    expect(entryRefusal({ ...base, challenge: { ...challenge, pausedAt: at(5) } })?.code).toBe("PAUSED");
  });

  it("refuses before entries open and after they close, on the clock as well as the status", () => {
    expect(entryRefusal({ ...base, challenge: { ...challenge, status: "SCHEDULED" } })?.code).toBe("NOT_OPEN");
    expect(entryRefusal({ ...base, now: at(-1) })?.code).toBe("NOT_OPEN");
    expect(entryRefusal({ ...base, now: at(59) })).toBeNull();
    // The sweep may not have run yet: the status still says OPEN, the clock says closed. The clock wins.
    expect(entryRefusal({ ...base, now: at(60) })?.code).toBe("ENTRIES_CLOSED");
    expect(entryRefusal({ ...base, challenge: { ...challenge, status: "LIVE" } })?.code).toBe("ENTRIES_CLOSED");
  });

  it("refuses the entry after the last place, and a second entry from the same player", () => {
    expect(entryRefusal({ ...base, activeEntryCount: 2 })).toBeNull();
    expect(entryRefusal({ ...base, activeEntryCount: 3 })?.code).toBe("FULL");
    expect(entryRefusal({ ...base, alreadyEntered: true })?.code).toBe("ALREADY_ENTERED");
  });

  it("refuses a fee above the current ceiling, even on an already published challenge", () => {
    expect(entryRefusal({ ...base, maxEntryFeeKobo: 99_999 })?.code).toBe("FEE_ABOVE_CAP");
    expect(entryRefusal({ ...base, maxEntryFeeKobo: 100_000 })).toBeNull();
  });
});

describe("withdrawRefusal", () => {
  const challenge = {
    status: "OPEN" as const,
    pausedAt: null,
    entryFee: 100_000,
    maxEntrants: 3,
    entryOpensAt: at(0),
    entryClosesAt: at(60),
    windowStartsAt: at(90),
    submissionsCloseAt: at(180),
  };

  it("lets a player out, with their fee back, until the window starts", () => {
    expect(withdrawRefusal({ challenge, entryStatus: "ENTERED", now: at(30) })).toBeNull();
    expect(withdrawRefusal({ challenge, entryStatus: "ENTERED", now: at(89) })).toBeNull();
    expect(withdrawRefusal({ challenge, entryStatus: "ENTERED", now: at(90) })?.code).toBe("WINDOW_STARTED");
  });

  it("refuses once it is live, and for an entry that is not in a state to leave", () => {
    expect(withdrawRefusal({ challenge: { ...challenge, status: "LIVE" }, entryStatus: "ENTERED", now: at(30) })?.code).toBe("WINDOW_STARTED");
    expect(withdrawRefusal({ challenge, entryStatus: "SUBMITTED", now: at(30) })?.code).toBe("NOT_ENTERED");
    expect(withdrawRefusal({ challenge, entryStatus: "WITHDRAWN", now: at(30) })?.code).toBe("NOT_ENTERED");
  });
});

describe("submitRefusal", () => {
  const challenge = {
    status: "LIVE" as const,
    pausedAt: null,
    entryFee: 100_000,
    maxEntrants: 3,
    entryOpensAt: at(0),
    entryClosesAt: at(60),
    windowStartsAt: at(60),
    submissionsCloseAt: at(180),
  };
  const base = { challenge, entryStatus: "ENTERED", hasSubmission: false, now: at(120) };

  it("accepts one score from an entrant while the challenge is live", () => {
    expect(submitRefusal(base)).toBeNull();
    expect(submitRefusal({ ...base, now: at(180) })).toBeNull();
  });

  it("refuses a late score by the server clock, even if the sweep has not closed the challenge yet", () => {
    expect(submitRefusal({ ...base, now: new Date(at(180).getTime() + 1) })?.code).toBe("SUBMISSIONS_CLOSED");
  });

  it("refuses a second score, a non-entrant, a paused challenge, and anything before it is live", () => {
    expect(submitRefusal({ ...base, hasSubmission: true })?.code).toBe("ALREADY_SUBMITTED");
    expect(submitRefusal({ ...base, entryStatus: "WITHDRAWN" })?.code).toBe("NOT_ENTERED");
    expect(submitRefusal({ ...base, challenge: { ...challenge, pausedAt: at(100) } })?.code).toBe("PAUSED");
    // Before the window it is not live, whatever the status says; once the window has begun an OPEN status (the sweep a
    // little behind) still takes scores.
    expect(submitRefusal({ ...base, challenge: { ...challenge, status: "OPEN" }, now: at(59) })?.code).toBe("NOT_LIVE");
    expect(submitRefusal({ ...base, challenge: { ...challenge, status: "OPEN" } })).toBeNull();
    expect(submitRefusal({ ...base, challenge: { ...challenge, status: "UNDER_REVIEW" } })?.code).toBe("NOT_LIVE");
    expect(submitRefusal({ ...base, now: at(59) })?.code).toBe("NOT_LIVE");
  });
});

describe("refunds and evidence", () => {
  it("refunds everyone who paid and hasn't already been paid back when a challenge is cancelled", () => {
    for (const s of ["ENTERED", "SUBMITTED", "VERIFIED", "REJECTED", "DISQUALIFIED"]) expect(refundableOnCancel(s)).toBe(true);
    expect(refundableOnCancel("WITHDRAWN")).toBe(false);
    expect(refundableOnCancel("REFUNDED")).toBe(false);
  });

  it("flags a screenshot timestamp outside the match window, and says nothing about one it cannot read", () => {
    const w = { windowStartsAt: at(60), submissionsCloseAt: at(180) };
    expect(evidenceTimingFlag({ ...w, capturedAt: null })).toBeNull();
    expect(evidenceTimingFlag({ ...w, capturedAt: at(60) })).toBeNull();
    expect(evidenceTimingFlag({ ...w, capturedAt: at(180) })).toBeNull();
    expect(evidenceTimingFlag({ ...w, capturedAt: at(59) })).toBe("OUTSIDE_WINDOW");
    expect(evidenceTimingFlag({ ...w, capturedAt: at(181) })).toBe("OUTSIDE_WINDOW");
  });
});

describe("pause and resume", () => {
  const deadlines = {
    entryOpensAt: at(0),
    entryClosesAt: at(60),
    windowStartsAt: at(60),
    windowEndsAt: at(120),
    submissionsCloseAt: at(180),
    provisionalAt: null,
  };

  it("can pause anything that is running or waiting on a clock, and nothing else", () => {
    for (const s of ["SCHEDULED", "OPEN", "LIVE", "SUBMISSIONS_CLOSED", "UNDER_REVIEW", "PROVISIONAL"] as const) expect(isPausable(s)).toBe(true);
    for (const s of ["DRAFT", "FINALIZED", "SETTLING", "COMPLETED", "CANCELLED"] as const) expect(isPausable(s)).toBe(false);
  });

  it("lets only a draft be edited", () => {
    expect(isEditable("DRAFT")).toBe(true);
    expect(isEditable("SCHEDULED")).toBe(false);
    expect(isEditable("OPEN")).toBe(false);
  });

  it("gives the paused time back to every deadline that was still ahead", () => {
    // Paused at minute 90 (mid-window), resumed at minute 110: a 20 minute pause.
    const shifted = shiftOnResume(deadlines, at(90), at(110));
    expect(shifted.entryOpensAt).toEqual(at(0));
    expect(shifted.entryClosesAt).toEqual(at(60));
    expect(shifted.windowStartsAt).toEqual(at(60));
    expect(shifted.windowEndsAt).toEqual(at(140));
    expect(shifted.submissionsCloseAt).toEqual(at(200));
  });

  it("never reopens a deadline that had already passed, and keeps the order the database requires", () => {
    const shifted = shiftOnResume(deadlines, at(30), at(50));
    expect(shifted.entryOpensAt).toEqual(at(0));
    const order = [shifted.entryOpensAt, shifted.entryClosesAt, shifted.windowStartsAt, shifted.windowEndsAt, shifted.submissionsCloseAt].map((d) => d.getTime());
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Entries closing and the window starting were the same instant and stay the same instant.
    expect(shifted.entryClosesAt).toEqual(shifted.windowStartsAt);
  });

  it("stretches the dispute window by moving the provisional time later", () => {
    const shifted = shiftOnResume({ ...deadlines, provisionalAt: at(200) }, at(210), at(240));
    expect(shifted.provisionalAt).toEqual(at(230));
  });

  it("does nothing if resumed at the instant it was paused, or if the clock went backwards", () => {
    expect(shiftOnResume(deadlines, at(90), at(90))).toEqual(deadlines);
    expect(shiftOnResume(deadlines, at(90), at(80))).toEqual(deadlines);
  });
});

describe("requirements: parsing what an admin sends", () => {
  it("accepts conditions and targets, in order", () => {
    const r = parseRequirements([
      { kind: "CONDITION", label: "Win the match" },
      { kind: "TARGET", label: "Kills", threshold: 10 },
      { kind: "TARGET", label: "Time", threshold: "600", direction: "LOWER", unit: "seconds" },
    ]);
    expect(r).toEqual({
      ok: true,
      value: [
        { key: "req-0", kind: "CONDITION", label: "Win the match", gate: true, needsRecording: false, unit: null, direction: null, threshold: null },
        { key: "req-1", kind: "TARGET", label: "Kills", gate: true, needsRecording: false, unit: null, direction: "HIGHER", threshold: 10 },
        { key: "req-2", kind: "TARGET", label: "Time", gate: true, needsRecording: false, unit: "seconds", direction: "LOWER", threshold: 600 },
      ],
    });
  });

  it("keeps a client's keys, lets a requirement be category-only, and flags a stat that needs a recording", () => {
    const r = parseRequirements([
      { key: "win", kind: "CONDITION", label: "Win the match", gate: false },
      { key: "hs", kind: "TARGET", label: "Headshots", threshold: 5, needsRecording: true },
    ]);
    expect(r).toMatchObject({ ok: true, value: [{ key: "win", gate: false, needsRecording: false }, { key: "hs", gate: true, needsRecording: true }] });
    expect(parseRequirements([{ key: "x", kind: "CONDITION", label: "A" }, { key: "x", kind: "CONDITION", label: "B" }])).toMatchObject({ ok: false, error: expect.stringContaining("share an id") });
  });

  it("treats nothing as no requirements", () => {
    for (const none of [undefined, null, "", []]) expect(parseRequirements(none)).toEqual({ ok: true, value: [] });
  });

  it("refuses a missing label, a bad kind, a missing or fractional target, and a duplicate", () => {
    expect(parseRequirements([{ kind: "CONDITION", label: " " }])).toMatchObject({ ok: false, error: expect.stringContaining("needs a label") });
    expect(parseRequirements([{ kind: "BONUS", label: "x" }])).toMatchObject({ ok: false, error: expect.stringContaining("condition or target") });
    expect(parseRequirements([{ kind: "TARGET", label: "Kills" }])).toMatchObject({ ok: false, error: expect.stringContaining("whole number") });
    expect(parseRequirements([{ kind: "TARGET", label: "Kills", threshold: 2.5 }]).ok).toBe(false);
    expect(parseRequirements([{ kind: "TARGET", label: "Kills", threshold: -1 }]).ok).toBe(false);
    expect(parseRequirements([{ kind: "TARGET", label: "Kills", threshold: 5, direction: "SIDEWAYS" }]).ok).toBe(false);
    expect(parseRequirements([{ kind: "CONDITION", label: "Win" }, { kind: "CONDITION", label: "win" }])).toMatchObject({ ok: false, error: expect.stringContaining("twice") });
    expect(parseRequirements("nope").ok).toBe(false);
  });

  it("caps how many there can be", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ kind: "CONDITION", label: `Rule ${i}` }));
    expect(parseRequirements(nine)).toMatchObject({ ok: false, error: expect.stringContaining("at most 8") });
    expect(parseRequirements(nine.slice(0, 8)).ok).toBe(true);
  });
});

describe("requirements: reading them", () => {
  it("meets a target at the threshold, in either direction", () => {
    expect(targetMet("HIGHER", 10, 10)).toBe(true);
    expect(targetMet("HIGHER", 10, 9)).toBe(false);
    expect(targetMet("LOWER", 600, 600)).toBe(true);
    expect(targetMet("LOWER", 600, 601)).toBe(false);
  });

  it("describes each kind the way a player reads it", () => {
    expect(describeRequirement({ kind: "CONDITION", label: "Win the match", unit: null, direction: null, threshold: null })).toBe("Win the match");
    expect(describeRequirement({ kind: "TARGET", label: "Kills", unit: null, direction: "HIGHER", threshold: 10 })).toBe("At least 10 — kills");
    expect(describeRequirement({ kind: "TARGET", label: "Match time", unit: "seconds", direction: "LOWER", threshold: 600 })).toBe("At most 600 seconds — match time");
  });
});

describe("requirements: what a player claims", () => {
  const reqs = [
    { id: "a", kind: "CONDITION" as const, label: "Win the match" },
    { id: "b", kind: "TARGET" as const, label: "Kills" },
  ];

  it("takes a tick for a condition and a whole number for a target", () => {
    const r = parseRequirementClaims([{ requirementId: "b", claimedValue: "12" }, { requirementId: "a", claimedMet: true }], reqs);
    expect(r).toEqual({ ok: true, value: [{ requirementId: "a", claimedMet: true }, { requirementId: "b", claimedValue: 12 }] });
  });

  it("lets a player say they did not meet a condition — staff will reject it, but nothing is left blank", () => {
    expect(parseRequirementClaims([{ requirementId: "a", claimedMet: false }, { requirementId: "b", claimedValue: 3 }], reqs).ok).toBe(true);
  });

  it("refuses an unanswered, doubled, unknown or malformed answer", () => {
    expect(parseRequirementClaims([{ requirementId: "a", claimedMet: true }], reqs)).toMatchObject({ ok: false, error: expect.stringContaining("Kills") });
    expect(parseRequirementClaims([{ requirementId: "a", claimedMet: true }, { requirementId: "a", claimedMet: true }, { requirementId: "b", claimedValue: 1 }], reqs)).toMatchObject({ ok: false, error: expect.stringContaining("twice") });
    expect(parseRequirementClaims([{ requirementId: "zzz", claimedMet: true }], reqs).ok).toBe(false);
    expect(parseRequirementClaims([{ requirementId: "a", claimedValue: 5 }, { requirementId: "b", claimedValue: 1 }], reqs)).toMatchObject({ ok: false, error: expect.stringContaining("whether you met") });
    expect(parseRequirementClaims([{ requirementId: "a", claimedMet: true }, { requirementId: "b", claimedValue: 1.5 }], reqs).ok).toBe(false);
    expect(parseRequirementClaims("nope", reqs).ok).toBe(false);
  });

  it("asks for nothing when the challenge has no requirements", () => {
    expect(parseRequirementClaims(undefined, [])).toEqual({ ok: true, value: [] });
  });
});

describe("requirements: who qualifies", () => {
  const reqs = [
    { id: "a", kind: "CONDITION" as const, label: "Win the match" },
    { id: "b", kind: "TARGET" as const, label: "Kills" },
  ];

  it("qualifies only when every requirement has a verdict of met", () => {
    expect(evaluateRequirements(reqs, [{ requirementId: "a", met: true }, { requirementId: "b", met: true }])).toEqual({ qualifies: true, failed: [], undecided: [] });
  });

  it("names the requirement that was missed", () => {
    expect(evaluateRequirements(reqs, [{ requirementId: "a", met: true }, { requirementId: "b", met: false }])).toEqual({ qualifies: false, failed: ["Kills"], undecided: [] });
  });

  it("cannot be approved by leaving a line blank", () => {
    const r = evaluateRequirements(reqs, [{ requirementId: "a", met: true }]);
    expect(r.qualifies).toBe(false);
    expect(r.undecided).toEqual(["Kills"]);
    expect(evaluateRequirements(reqs, [{ requirementId: "a", met: true }, { requirementId: "b", met: null }]).qualifies).toBe(false);
  });

  it("qualifies a challenge with no requirements", () => {
    expect(evaluateRequirements([], [])).toEqual({ qualifies: true, failed: [], undecided: [] });
  });
});

describe("challenge type, weapon, minimum and no-winner policy", () => {
  const limits = { maxEntryFeeKobo: 200_000, maxEntrants: 100 };
  const good = () => ({
    gameId: "game1",
    title: "AK-47 Kill Leader",
    rules: "Battle Royale, one match.",
    evidenceRequirements: "A screen recording.",
    metricLabel: "AK-47 kills",
    entryFee: 100_000,
    minEntrants: 20,
    maxEntrants: 100,
    entryOpensAt: "2026-11-01T10:00:00Z",
    entryClosesAt: "2026-11-01T14:00:00Z",
    windowStartsAt: "2026-11-01T14:00:00Z",
    windowEndsAt: "2026-11-01T16:00:00Z",
    submissionsCloseAt: "2026-11-01T16:30:00Z",
  });

  it("defaults to a standard challenge where the house keeps the money if nobody qualifies", () => {
    const r = parseChallengeInput(good(), limits);
    expect(r).toMatchObject({ ok: true, value: { kind: "STANDARD", weaponLabel: null, minScore: null, noWinnerPolicy: "HOUSE_KEEPS", cadence: "ONE_OFF", scoreNeedsRecording: false } });
  });

  it("takes a weapon, a minimum score and a refund policy", () => {
    const r = parseChallengeInput({ ...good(), kind: "WEAPON", weaponLabel: " AK-47 ", minScore: "5", noWinnerPolicy: "REFUND_ENTRIES", cadence: "DAILY", scoreNeedsRecording: true }, limits);
    expect(r).toMatchObject({ ok: true, value: { kind: "WEAPON", weaponLabel: "AK-47", minScore: 5, noWinnerPolicy: "REFUND_ENTRIES", cadence: "DAILY", scoreNeedsRecording: true } });
  });

  it("insists a weapon challenge names its weapon, and refuses nonsense", () => {
    expect(parseChallengeInput({ ...good(), kind: "WEAPON" }, limits)).toMatchObject({ ok: false, error: expect.stringContaining("which weapon") });
    expect(parseChallengeInput({ ...good(), kind: "BOSS" }, limits).ok).toBe(false);
    expect(parseChallengeInput({ ...good(), minScore: -1 }, limits).ok).toBe(false);
    expect(parseChallengeInput({ ...good(), minScore: 2.5 }, limits).ok).toBe(false);
    expect(parseChallengeInput({ ...good(), noWinnerPolicy: "KEEP_SOME" }, limits).ok).toBe(false);
  });
});

describe("a review below the minimum score", () => {
  const base = { decision: "APPROVE" as const, reasonCode: null, note: null, failed: [], undecided: [], verifiedScore: 3, tiebreakRequired: false, verifiedTiebreak: null };

  it("can't be approved, but can be rejected with the reason for it", () => {
    expect(reviewRefusal({ ...base, belowMinimum: true })).toMatch(/below the minimum/);
    expect(reviewRefusal({ ...base, belowMinimum: false })).toBeNull();
    expect(reviewRefusal({ ...base, decision: "REJECT", reasonCode: "SCORE_BELOW_MINIMUM", belowMinimum: true })).toBeNull();
  });
});
