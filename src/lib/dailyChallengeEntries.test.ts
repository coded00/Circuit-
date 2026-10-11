import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { advanceDailyChallenges, enterChallenge, refundAllEntries, withdrawEntry, ChallengeRefusedError } from "@/lib/dailyChallengeEntries";
import { cancelChallenge } from "@/lib/dailyChallengeAdmin";
import { InsufficientWalletBalanceError, lockStake, StakeLimitError } from "@/lib/stakes";
import { cleanupAll, createTestCompetition, createTestStaff, createTestUser } from "@/testHelpers";

/**
 * Entry, withdrawal and refunds against a real database. What these pin down is the money: the wallet is debited
 * exactly once however many times a button is pressed, the last place goes to exactly one of two simultaneous
 * players, a failed entry leaves nothing behind, and a cancelled challenge puts every kobo back — to the player's
 * wallet and to Circuit's books — as new ledger rows, never edits.
 */

// These run against a remote database and each test cleans up after itself, so they are slow. A generous
// per-test limit keeps a slow network from reading as a failure.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 });

const HOUR = 3_600_000;
const FEE = 100_000; // ₦1,000
const BPS = 1000; // 10% → ₦100 cut

let saved: Record<string, unknown> | null = null;

beforeAll(async () => {
  const s = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  saved = s ? { dailyChallengesEnabled: s.dailyChallengesEnabled, maxChallengeEntryFeeKobo: s.maxChallengeEntryFeeKobo, maxChallengeEntrants: s.maxChallengeEntrants, maxLockedStakeKobo: s.maxLockedStakeKobo, maxDailyStakeKobo: s.maxDailyStakeKobo } : null;
  await setSettings({ dailyChallengesEnabled: true, maxChallengeEntryFeeKobo: 200_000, maxChallengeEntrants: 50, maxLockedStakeKobo: 50_000_000, maxDailyStakeKobo: 100_000_000 });
});

afterAll(async () => {
  if (saved) await prisma.platformSetting.update({ where: { id: "singleton" }, data: saved });
  else await prisma.platformSetting.update({ where: { id: "singleton" }, data: { dailyChallengesEnabled: false } }).catch(() => {});
});

afterEach(async () => {
  await setSettings({ dailyChallengesEnabled: true, maxLockedStakeKobo: 50_000_000, maxDailyStakeKobo: 100_000_000 });
  await cleanupAll();
});

async function setSettings(data: Record<string, unknown>) {
  await prisma.platformSetting.upsert({ where: { id: "singleton" }, create: { id: "singleton", ...data }, update: data });
}

async function openChallenge(over: Record<string, unknown> = {}) {
  const staff = await createTestStaff();
  const { gameId } = await createTestCompetition();
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  const now = Date.now();
  const challenge = await prisma.dailyChallenge.create({
    data: {
      gameId,
      gameName: game.name,
      title: "TEST challenge",
      rules: "r",
      evidenceRequirements: "e",
      metricLabel: "Kills",
      entryFee: FEE,
      minEntrants: 2,
      maxEntrants: 10,
      platformFeeBps: BPS,
      status: "OPEN",
      entryOpensAt: new Date(now - HOUR),
      entryClosesAt: new Date(now + HOUR),
      windowStartsAt: new Date(now + HOUR),
      windowEndsAt: new Date(now + 2 * HOUR),
      submissionsCloseAt: new Date(now + 3 * HOUR),
      createdById: staff.id,
      ...over,
    },
  });
  return { challenge, staff, gameId };
}

async function player(gameId: string, over: Record<string, unknown> = {}, withName = true) {
  const user = await createTestUser({ walletBalance: 1_000_000, dateOfBirth: new Date("1995-01-01"), ...over });
  if (withName) await prisma.userGameName.create({ data: { userId: user.id, gameId, name: `TEST-ign-${user.handle}` } });
  return user;
}

const balance = async (userId: string) => (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { walletBalance: true } })).walletBalance;
const rows = (challengeId: string, type: string) => prisma.escrowTransaction.findMany({ where: { dailyChallengeId: challengeId, type: type as never } });

describe("enterChallenge: the money", () => {
  it("debits the wallet once and writes the entry, the fee split and the wallet row", async () => {
    const { challenge, gameId } = await openChallenge();
    const p = await player(gameId);
    const { entryId } = await enterChallenge({ userId: p.id, challengeId: challenge.id });

    expect(await balance(p.id)).toBe(1_000_000 - FEE);
    const entry = await prisma.dailyChallengeEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(entry.status).toBe("ENTERED");
    expect(entry.inGameName).toContain("TEST-ign");
    const [paid] = await rows(challenge.id, "CHALLENGE_ENTRY");
    const [cut] = await rows(challenge.id, "CHALLENGE_PLATFORM_FEE");
    expect(paid).toMatchObject({ amount: FEE, userId: p.id, status: "COMPLETE", dailyChallengeEntryId: entryId });
    expect(cut).toMatchObject({ amount: 10_000, userId: null });
    expect(await prisma.walletTransaction.count({ where: { userId: p.id, type: "CHALLENGE_ENTRY_DEBIT", amount: FEE } })).toBe(1);
  });

  it("takes a free entry without touching the wallet or writing any money row", async () => {
    const { challenge, gameId } = await openChallenge({ entryFee: 0 });
    const p = await player(gameId, { walletBalance: 0, dateOfBirth: new Date("2015-01-01") }); // no money, and a child
    await enterChallenge({ userId: p.id, challengeId: challenge.id });
    expect(await balance(p.id)).toBe(0);
    expect(await prisma.escrowTransaction.count({ where: { dailyChallengeId: challenge.id } })).toBe(0);
  });

  it("charges once when the button is pressed twice at the same moment", async () => {
    const { challenge, gameId } = await openChallenge();
    const p = await player(gameId);
    const results = await Promise.allSettled([enterChallenge({ userId: p.id, challengeId: challenge.id }), enterChallenge({ userId: p.id, challengeId: challenge.id })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(ChallengeRefusedError);
    expect(lost.reason.code).toBe("ALREADY_ENTERED");
    expect(await balance(p.id)).toBe(1_000_000 - FEE);
    expect(await rows(challenge.id, "CHALLENGE_ENTRY")).toHaveLength(1);
  });

  it("gives the last place to exactly one of two simultaneous players", async () => {
    const { challenge, gameId } = await openChallenge({ minEntrants: 1, maxEntrants: 1 });
    const [a, b] = await Promise.all([player(gameId), player(gameId)]);
    const results = await Promise.allSettled([enterChallenge({ userId: a.id, challengeId: challenge.id }), enterChallenge({ userId: b.id, challengeId: challenge.id })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.code).toBe("FULL");
    // Whoever lost was not charged.
    const balances = [await balance(a.id), await balance(b.id)].sort((x, y) => x - y);
    expect(balances).toEqual([1_000_000 - FEE, 1_000_000]);
    expect(await prisma.dailyChallengeEntry.count({ where: { challengeId: challenge.id } })).toBe(1);
  });

  it("leaves nothing behind when the wallet can't cover the fee", async () => {
    const { challenge, gameId } = await openChallenge();
    const p = await player(gameId, { walletBalance: FEE - 1 });
    await expect(enterChallenge({ userId: p.id, challengeId: challenge.id })).rejects.toBeInstanceOf(InsufficientWalletBalanceError);
    expect(await balance(p.id)).toBe(FEE - 1);
    expect(await prisma.dailyChallengeEntry.count({ where: { challengeId: challenge.id } })).toBe(0);
    expect(await prisma.escrowTransaction.count({ where: { dailyChallengeId: challenge.id } })).toBe(0);
  });
});

describe("enterChallenge: who and when", () => {
  it("refuses a player with no in-game name for the game", async () => {
    const { challenge, gameId } = await openChallenge();
    const p = await player(gameId, {}, false);
    await expect(enterChallenge({ userId: p.id, challengeId: challenge.id })).rejects.toMatchObject({ code: "NO_IN_GAME_NAME" });
    expect(await balance(p.id)).toBe(1_000_000);
  });

  it("refuses under-18s a paid challenge but not a free one", async () => {
    const paid = await openChallenge();
    const kid = await player(paid.gameId, { dateOfBirth: new Date(Date.now() - 15 * 365 * 24 * HOUR) });
    await expect(enterChallenge({ userId: kid.id, challengeId: paid.challenge.id })).rejects.toMatchObject({ code: "AGE" });
    expect(await balance(kid.id)).toBe(1_000_000);
  });

  it("refuses a suspended account and a self-excluded one, and charges neither", async () => {
    const { challenge, gameId } = await openChallenge();
    const suspended = await player(gameId, { isSuspended: true, suspensionReason: "test" });
    await expect(enterChallenge({ userId: suspended.id, challengeId: challenge.id })).rejects.toMatchObject({ code: "SUSPENDED" });
    const excluded = await player(gameId, { selfExcludedUntil: new Date(Date.now() + 24 * HOUR) });
    await expect(enterChallenge({ userId: excluded.id, challengeId: challenge.id })).rejects.toBeInstanceOf(StakeLimitError);
    expect(await balance(excluded.id)).toBe(1_000_000);
    expect(await prisma.dailyChallengeEntry.count({ where: { challengeId: challenge.id } })).toBe(0);
  });

  it("refuses before entries open, after they close, when paused, and while the platform switch is off", async () => {
    const early = await openChallenge({ status: "SCHEDULED", entryOpensAt: new Date(Date.now() + HOUR), entryClosesAt: new Date(Date.now() + 2 * HOUR), windowStartsAt: new Date(Date.now() + 2 * HOUR), windowEndsAt: new Date(Date.now() + 3 * HOUR), submissionsCloseAt: new Date(Date.now() + 4 * HOUR) });
    const p = await player(early.gameId);
    await expect(enterChallenge({ userId: p.id, challengeId: early.challenge.id })).rejects.toMatchObject({ code: "NOT_OPEN" });

    const open = await openChallenge();
    const q = await player(open.gameId);
    await expect(enterChallenge({ userId: q.id, challengeId: open.challenge.id, now: new Date(open.challenge.entryClosesAt.getTime() + 1) })).rejects.toMatchObject({ code: "ENTRIES_CLOSED" });

    await prisma.dailyChallenge.update({ where: { id: open.challenge.id }, data: { pausedAt: new Date() } });
    await expect(enterChallenge({ userId: q.id, challengeId: open.challenge.id })).rejects.toMatchObject({ code: "PAUSED" });
    await prisma.dailyChallenge.update({ where: { id: open.challenge.id }, data: { pausedAt: null } });

    await setSettings({ dailyChallengesEnabled: false });
    await expect(enterChallenge({ userId: q.id, challengeId: open.challenge.id })).rejects.toMatchObject({ code: "DISABLED" });
    expect(await balance(q.id)).toBe(1_000_000);
  });
});

describe("one budget for stakes and challenge entries", () => {
  it("counts challenge entries toward the daily limit", async () => {
    await setSettings({ maxDailyStakeKobo: 150_000 });
    const a = await openChallenge();
    const b = await openChallenge();
    const p = await player(a.gameId);
    await prisma.userGameName.create({ data: { userId: p.id, gameId: b.gameId, name: "TEST-ign-b" } });
    await enterChallenge({ userId: p.id, challengeId: a.challenge.id });
    await expect(enterChallenge({ userId: p.id, challengeId: b.challenge.id })).rejects.toMatchObject({ code: "DAILY_TOTAL" });
    expect(await balance(p.id)).toBe(1_000_000 - FEE);
  });

  it("counts them toward a Battle stake too, so the budget can't be spent twice at full size", async () => {
    await setSettings({ maxDailyStakeKobo: 150_000 });
    const { challenge, gameId } = await openChallenge();
    const p = await player(gameId);
    await enterChallenge({ userId: p.id, challengeId: challenge.id });
    await expect(prisma.$transaction((tx) => lockStake(tx, { userId: p.id, amount: FEE }))).rejects.toMatchObject({ code: "DAILY_TOTAL" });
  });

  it("does not hand the daily budget back when an entry is withdrawn", async () => {
    await setSettings({ maxDailyStakeKobo: 150_000 });
    const { challenge, gameId } = await openChallenge();
    const p = await player(gameId);
    await enterChallenge({ userId: p.id, challengeId: challenge.id });
    await withdrawEntry({ userId: p.id, challengeId: challenge.id });
    await expect(prisma.$transaction((tx) => lockStake(tx, { userId: p.id, amount: FEE }))).rejects.toMatchObject({ code: "DAILY_TOTAL" });
  });
});

describe("withdrawEntry", () => {
  it("puts the fee and Circuit's cut back as new rows, and lets the player enter again", async () => {
    const { challenge, gameId } = await openChallenge();
    const p = await player(gameId);
    await enterChallenge({ userId: p.id, challengeId: challenge.id });
    const r = await withdrawEntry({ userId: p.id, challengeId: challenge.id });
    expect(r.refunded).toBe(FEE);
    expect(await balance(p.id)).toBe(1_000_000);
    expect((await prisma.dailyChallengeEntry.findFirstOrThrow({ where: { challengeId: challenge.id } })).status).toBe("WITHDRAWN");
    expect(await rows(challenge.id, "CHALLENGE_REFUND")).toHaveLength(1);
    expect(await rows(challenge.id, "CHALLENGE_PLATFORM_FEE_REVERSAL")).toHaveLength(1);
    // The original rows are still there: a correction is a new row.
    expect(await rows(challenge.id, "CHALLENGE_ENTRY")).toHaveLength(1);

    // Back in, on the same entry row, charged again.
    await enterChallenge({ userId: p.id, challengeId: challenge.id });
    expect(await balance(p.id)).toBe(1_000_000 - FEE);
    expect(await prisma.dailyChallengeEntry.count({ where: { challengeId: challenge.id } })).toBe(1);
    expect(await rows(challenge.id, "CHALLENGE_ENTRY")).toHaveLength(2);
  });

  it("refunds once when pressed twice at the same moment", async () => {
    const { challenge, gameId } = await openChallenge();
    const p = await player(gameId);
    await enterChallenge({ userId: p.id, challengeId: challenge.id });
    const results = await Promise.allSettled([withdrawEntry({ userId: p.id, challengeId: challenge.id }), withdrawEntry({ userId: p.id, challengeId: challenge.id })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balance(p.id)).toBe(1_000_000);
    expect(await rows(challenge.id, "CHALLENGE_REFUND")).toHaveLength(1);
  });

  it("refuses once the match window has started", async () => {
    const { challenge, gameId } = await openChallenge();
    const p = await player(gameId);
    await enterChallenge({ userId: p.id, challengeId: challenge.id });
    await expect(withdrawEntry({ userId: p.id, challengeId: challenge.id, now: new Date(challenge.windowStartsAt.getTime() + 1) })).rejects.toMatchObject({ code: "WINDOW_STARTED" });
    expect(await balance(p.id)).toBe(1_000_000 - FEE);
  });
});

describe("cancelling refunds everyone", () => {
  it("returns every fee to every player and Circuit's cut to the books, and tells them", async () => {
    const { challenge, gameId, staff } = await openChallenge();
    const players = await Promise.all([player(gameId), player(gameId), player(gameId)]);
    for (const p of players) await enterChallenge({ userId: p.id, challengeId: challenge.id });

    const r = await cancelChallenge(challenge.id, "Servers are down", staff.id);
    expect(r).toMatchObject({ ok: true, refunded: 3 });
    for (const p of players) expect(await balance(p.id)).toBe(1_000_000);
    expect((await prisma.dailyChallengeEntry.findMany({ where: { challengeId: challenge.id } })).every((e) => e.status === "REFUNDED")).toBe(true);

    // The books balance: what came in as entries and fees went out as refunds and reversals, to the kobo.
    const sum = async (type: string) => (await rows(challenge.id, type)).reduce((a, r) => a + r.amount, 0);
    expect(await sum("CHALLENGE_ENTRY")).toBe(await sum("CHALLENGE_REFUND"));
    expect(await sum("CHALLENGE_PLATFORM_FEE")).toBe(await sum("CHALLENGE_PLATFORM_FEE_REVERSAL"));
    expect(await sum("CHALLENGE_REFUND")).toBe(3 * FEE);

    const note = await prisma.notification.findFirstOrThrow({ where: { userId: players[0].id, type: "DAILY_CHALLENGE_CANCELLED" } });
    expect(note.payload).toMatchObject({ challengeId: challenge.id, reason: "Servers are down", refunded: FEE });
  });

  it("is safe to run again: nothing is refunded twice", async () => {
    const { challenge, gameId, staff } = await openChallenge();
    const p = await player(gameId);
    await enterChallenge({ userId: p.id, challengeId: challenge.id });
    await cancelChallenge(challenge.id, "Servers are down", staff.id);
    const again = await refundAllEntries(challenge.id, { title: "t", reason: null });
    expect(again).toEqual({ refunded: 0, failed: 0 });
    expect(await balance(p.id)).toBe(1_000_000);
    expect(await rows(challenge.id, "CHALLENGE_REFUND")).toHaveLength(1);
  });

  it("is finished by the sweep if the request died between cancelling and refunding", async () => {
    const { challenge, gameId } = await openChallenge();
    const p = await player(gameId);
    await enterChallenge({ userId: p.id, challengeId: challenge.id });
    // The crash: marked cancelled, nobody refunded.
    await prisma.dailyChallenge.update({ where: { id: challenge.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledReason: "interrupted" } });
    expect(await balance(p.id)).toBe(1_000_000 - FEE);

    const out = await advanceDailyChallenges(new Date(), { only: [challenge.id] });
    expect(out.refunded).toBeGreaterThanOrEqual(1);
    expect(await balance(p.id)).toBe(1_000_000);
  });

  it("refunds a free challenge's entries without writing any money rows", async () => {
    const { challenge, gameId, staff } = await openChallenge({ entryFee: 0 });
    const p = await player(gameId, { walletBalance: 0 });
    await enterChallenge({ userId: p.id, challengeId: challenge.id });
    expect(await cancelChallenge(challenge.id, "Not running", staff.id)).toMatchObject({ ok: true, refunded: 1 });
    expect(await balance(p.id)).toBe(0);
    expect(await prisma.escrowTransaction.count({ where: { dailyChallengeId: challenge.id } })).toBe(0);
  });
});

describe("advanceDailyChallenges", () => {
  it("opens a scheduled challenge once entries are due, then waits", async () => {
    const { challenge } = await openChallenge({ status: "SCHEDULED" });
    const out = await advanceDailyChallenges(new Date(), { only: [challenge.id] });
    expect(out.moved).toBeGreaterThanOrEqual(1);
    expect((await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).status).toBe("OPEN");
  });

  it("goes live at the window with enough players, and tells the entrants", async () => {
    const { challenge, gameId } = await openChallenge({ minEntrants: 2 });
    const [a, b] = await Promise.all([player(gameId), player(gameId)]);
    await enterChallenge({ userId: a.id, challengeId: challenge.id });
    await enterChallenge({ userId: b.id, challengeId: challenge.id });
    const later = new Date(challenge.windowStartsAt.getTime() + 1000);
    await advanceDailyChallenges(later, { only: [challenge.id] });
    expect((await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).status).toBe("LIVE");
    expect(await prisma.notification.count({ where: { userId: a.id, type: "DAILY_CHALLENGE_LIVE" } })).toBe(1);
  });

  it("cancels and refunds an under-filled challenge when entries close", async () => {
    const { challenge, gameId } = await openChallenge({ minEntrants: 3 });
    const a = await player(gameId);
    await enterChallenge({ userId: a.id, challengeId: challenge.id });
    const out = await advanceDailyChallenges(new Date(challenge.entryClosesAt.getTime() + 1000), { only: [challenge.id] });
    expect(out.cancelled).toBeGreaterThanOrEqual(1);
    const c = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
    expect(c.status).toBe("CANCELLED");
    expect(c.cancelledReason).toMatch(/refunded/);
    expect(await balance(a.id)).toBe(1_000_000);
  });

  it("carries a challenge to provisional results once nothing waits on a reviewer, but never touches a paused one", async () => {
    const { challenge, gameId } = await openChallenge({ minEntrants: 1, status: "LIVE" });
    const a = await player(gameId);
    await prisma.dailyChallengeEntry.create({ data: { challengeId: challenge.id, userId: a.id, inGameName: "x" } });

    await prisma.dailyChallenge.update({ where: { id: challenge.id }, data: { pausedAt: new Date() } });
    await advanceDailyChallenges(new Date(challenge.submissionsCloseAt.getTime() + HOUR), { only: [challenge.id] });
    expect((await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).status).toBe("LIVE");

    await prisma.dailyChallenge.update({ where: { id: challenge.id }, data: { pausedAt: null } });
    const later = new Date(challenge.submissionsCloseAt.getTime() + 24 * HOUR);
    await advanceDailyChallenges(later, { only: [challenge.id] });
    const c = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
    // Nobody submitted, so there is nothing to review: straight to provisional results, with the dispute window now running.
    expect(c.status).toBe("PROVISIONAL");
    expect(c.provisionalAt).not.toBeNull();
    // It is not final yet — the window hasn't passed — and a sweep a moment later changes nothing.
    await advanceDailyChallenges(later, { only: [challenge.id] });
    expect((await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).status).toBe("PROVISIONAL");
  });
});
