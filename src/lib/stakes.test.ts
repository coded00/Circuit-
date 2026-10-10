import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupAll, createTestUser } from "@/testHelpers";
import {
  DEFAULT_MAX_DAILY_STAKE,
  DEFAULT_MAX_LOCKED_STAKE,
  InsufficientWalletBalanceError,
  MAX_STAKE_AMOUNT,
  lockStake,
  stakeBudget,
} from "./stakes";
import { DAY_MS } from "./selfExclusion";

/**
 * Staked Battles are the closest thing on Circuit to gambling, and the limits
 * that make them safe are per account, not per Battle. These tests are about
 * what `lockStake` refuses, and — as much — about what it leaves behind when
 * it refuses: a limit that debits first and asks after is not a limit.
 *
 * The per-Battle cap is a code constant (MAX_STAKE_AMOUNT, ₦100,000), so every
 * fixture below stays under it and reaches the cumulative limits by holding
 * several stakes at once — which is the shape the cumulative limits exist for.
 *
 * Runs against a real Postgres like the rest of the integration suite.
 */

const NAIRA = 100; // kobo in a naira, to keep the fixtures readable

const CAP = MAX_STAKE_AMOUNT; // ₦100,000 — the most a single stake may be

const TEST_LIMITS = {
  stakedBattlesEnabled: true,
  maxLockedStakeKobo: 25_000_000, // ₦250,000 — 2.5 stakes' worth
  maxDailyStakeKobo: 40_000_000, // ₦400,000 — 4 stakes' worth
};

let original: {
  stakedBattlesEnabled: boolean;
  maxLockedStakeKobo: number;
  maxDailyStakeKobo: number;
} | null = null;

beforeEach(async () => {
  // The settings row is a singleton shared with every other test file (and
  // with whatever the dev database was left holding) — take a copy so
  // afterEach can put it back rather than leaving test limits behind.
  original = await prisma.platformSetting.findUnique({
    where: { id: "singleton" },
    select: { stakedBattlesEnabled: true, maxLockedStakeKobo: true, maxDailyStakeKobo: true },
  });
  await prisma.platformSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...TEST_LIMITS },
    update: TEST_LIMITS,
  });
});

afterEach(async () => {
  if (original) {
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: original });
  } else {
    await prisma.platformSetting.deleteMany({ where: { id: "singleton" } });
  }
  await cleanupAll();
});

function lock(userId: string, amount: number, target: { battleId?: string; quickMatchChallengeId?: string } = {}) {
  return prisma.$transaction((tx) => lockStake(tx, { userId, amount, ...target }));
}

function newBattle(creatorId: string, stakeAmount: number, status?: "OPEN" | "ACCEPTED" | "COMPLETE") {
  return prisma.battle.create({
    data: {
      creatorId,
      game: "Test Game",
      format: "SINGLE",
      visibility: "OPEN",
      stakeAmount,
      status,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
}

function newChallenge(hostId: string, stakeAmount: number, status?: "PENDING" | "ACCEPTED") {
  return prisma.quickMatchChallenge.create({
    data: { hostId, game: "Test Game", format: "SINGLE", stakeAmount, status, expiresAt: new Date(Date.now() + 60_000) },
  });
}

/** Sets up an account that already has `count` stakes of `amountEach` locked on Battles. */
async function battleStakes(userId: string, count: number, amountEach: number, status: "OPEN" | "COMPLETE", createdAt?: Date) {
  for (let i = 0; i < count; i += 1) {
    const battle = await newBattle(userId, amountEach, status);
    await prisma.escrowTransaction.create({
      data: { userId, type: "STAKE", amount: amountEach, status: "COMPLETE", createdAt, battleId: battle.id },
    });
  }
}

/** Sets up an account holding `count` unaccepted Quick Match challenges — stakes with no Battle behind them yet. */
async function pendingChallengeStakes(userId: string, count: number, amountEach: number) {
  for (let i = 0; i < count; i += 1) {
    const challenge = await newChallenge(userId, amountEach, "PENDING");
    await prisma.escrowTransaction.create({
      data: { userId, type: "STAKE", amount: amountEach, status: "COMPLETE", quickMatchChallengeId: challenge.id },
    });
  }
}

async function walletOf(userId: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { walletBalance: true } });
  return user.walletBalance;
}

function escrowCount(userId: string): Promise<number> {
  return prisma.escrowTransaction.count({ where: { userId } });
}

describe("lockStake refusals", () => {
  it("refuses more than one Battle's stake can be, and leaves nothing behind", async () => {
    const user = await createTestUser({ walletBalance: 100_000_000 });
    const battle = await newBattle(user.id, CAP + 1);
    const before = await walletOf(user.id);

    await expect(lock(user.id, CAP + 1, { battleId: battle.id })).rejects.toMatchObject({ code: "PER_BATTLE" });

    expect(await walletOf(user.id)).toBe(before);
    expect(await escrowCount(user.id)).toBe(0);
  });

  it("counts an unaccepted Quick Match host stake as exposure", async () => {
    // The point of this one: a host's stake is locked at challenge creation,
    // before any Battle exists, so a sum that filters on the battle relation
    // alone — as the wallet page's held-in-challenges figure does — sees this
    // account as having nothing at risk. Nothing in this fixture has a
    // battleId, so the challenge branch is the only thing that can refuse it.
    const user = await createTestUser({ walletBalance: 100_000_000 });
    await pendingChallengeStakes(user.id, 2, CAP); // ₦200,000 locked, no Battles
    const battle = await newBattle(user.id, CAP);

    await expect(lock(user.id, CAP, { battleId: battle.id })).rejects.toMatchObject({ code: "LOCKED_TOTAL" });
    expect(await escrowCount(user.id)).toBe(2); // only the pre-existing rows
  });

  it("counts an open Battle as exposure, and stops counting it once the Battle is settled", async () => {
    const user = await createTestUser({ walletBalance: 100_000_000 });
    await battleStakes(user.id, 2, CAP, "OPEN"); // ₦200,000 locked
    const next = await newBattle(user.id, CAP);

    await expect(lock(user.id, CAP, { battleId: next.id })).rejects.toMatchObject({ code: "LOCKED_TOTAL" });

    // Settled: the money is no longer at risk, so it stops counting against
    // the at-once limit — but it still counts against the daily one below.
    await prisma.battle.updateMany({ where: { creatorId: user.id, status: "OPEN" }, data: { status: "COMPLETE" } });
    await expect(lock(user.id, CAP, { battleId: next.id })).resolves.toBeUndefined();
  });

  it("counts a settled stake against the daily limit, so cancelling can't hand the budget back", async () => {
    // ₦400,000 already staked today and since settled (the STAKE row stays; a
    // refund is a second row). ₦10,000 more is over the ₦400,000 daily limit
    // even though almost nothing would be at risk — otherwise a pair could
    // move any amount by opening and cancelling in a loop.
    const user = await createTestUser({ walletBalance: 100_000_000 });
    await battleStakes(user.id, 4, CAP, "COMPLETE");
    const next = await newBattle(user.id, 10 * NAIRA);

    await expect(lock(user.id, 10 * NAIRA, { battleId: next.id })).rejects.toMatchObject({ code: "DAILY_TOTAL" });
  });

  it("does not count a stake older than the window against the daily limit", async () => {
    // The mirror of the test above, so it can't pass by counting every stake
    // ever: the same ₦400,000 staked 25 hours ago is outside the rolling window.
    const user = await createTestUser({ walletBalance: 100_000_000 });
    await battleStakes(user.id, 4, CAP, "COMPLETE", new Date(Date.now() - 25 * 3_600_000));
    const next = await newBattle(user.id, CAP);

    await expect(lock(user.id, CAP, { battleId: next.id })).resolves.toBeUndefined();
  });

  it("refuses everything while staking is switched off, and writes nothing", async () => {
    const user = await createTestUser({ walletBalance: 100_000_000 });
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: { stakedBattlesEnabled: false } });
    const battle = await newBattle(user.id, 10 * NAIRA);
    const before = await walletOf(user.id);

    await expect(lock(user.id, 10 * NAIRA, { battleId: battle.id })).rejects.toMatchObject({ code: "DISABLED" });

    expect(await walletOf(user.id)).toBe(before);
    expect(await escrowCount(user.id)).toBe(0);
  });

  it("refuses a stake while the player's own cool-off is running, and writes nothing", async () => {
    const user = await createTestUser({ walletBalance: 100_000_000, selfExcludedUntil: new Date(Date.now() + DAY_MS) });
    const battle = await newBattle(user.id, CAP);
    const before = await walletOf(user.id);

    await expect(lock(user.id, CAP, { battleId: battle.id })).rejects.toMatchObject({ code: "SELF_EXCLUDED" });

    expect(await walletOf(user.id)).toBe(before);
    expect(await escrowCount(user.id)).toBe(0);
  });

  it("refuses an over-cap stake from an excluded player as an exclusion, not as a cap", async () => {
    // Both limits would refuse this. The exclusion is checked first because it
    // is the one the player chose — answering "your stake is too large" to
    // someone who asked to be stopped is the wrong answer.
    const user = await createTestUser({ walletBalance: 100_000_000, selfExcludedUntil: new Date(Date.now() + DAY_MS) });
    const battle = await newBattle(user.id, CAP + 1);

    await expect(lock(user.id, CAP + 1, { battleId: battle.id })).rejects.toMatchObject({ code: "SELF_EXCLUDED" });
  });

  it("lets the player stake again once the cool-off has run out", async () => {
    // The other half: an expired timestamp is not an exclusion, and nothing
    // has to run to clear it. A column that stayed set would bar them forever.
    const user = await createTestUser({ walletBalance: 100_000_000, selfExcludedUntil: new Date(Date.now() - DAY_MS) });
    const battle = await newBattle(user.id, CAP);

    await expect(lock(user.id, CAP, { battleId: battle.id })).resolves.toBeUndefined();
    expect(await escrowCount(user.id)).toBe(1);
  });

  it("refuses a stake the wallet can't cover", async () => {
    const user = await createTestUser({ walletBalance: 50 * NAIRA }); // ₦50
    const battle = await newBattle(user.id, 100 * NAIRA); // ₦100

    await expect(lock(user.id, 100 * NAIRA, { battleId: battle.id })).rejects.toBeInstanceOf(InsufficientWalletBalanceError);
    expect(await escrowCount(user.id)).toBe(0);
  });
});

describe("lockStake success", () => {
  it("debits the wallet and writes both ledger rows when the stake is within every limit", async () => {
    const user = await createTestUser({ walletBalance: 10_000 * NAIRA });
    const battle = await newBattle(user.id, 3_000 * NAIRA);

    await lock(user.id, 3_000 * NAIRA, { battleId: battle.id });

    expect(await walletOf(user.id)).toBe(7_000 * NAIRA);
    const escrow = await prisma.escrowTransaction.findMany({ where: { userId: user.id } });
    expect(escrow).toHaveLength(1);
    expect(escrow[0]).toMatchObject({ type: "STAKE", amount: 3_000 * NAIRA, status: "COMPLETE", battleId: battle.id });
    const wallet = await prisma.walletTransaction.findMany({ where: { userId: user.id } });
    expect(wallet).toHaveLength(1);
    expect(wallet[0]).toMatchObject({ type: "STAKE_DEBIT", amount: 3_000 * NAIRA });
  });

  it("allows a stake that lands exactly on the limit", async () => {
    // Off-by-one on a money limit is the kind of thing that only shows up in
    // production, and "at most ₦100,000" has to mean ₦100,000 is allowed.
    const user = await createTestUser({ walletBalance: 100_000_000 });
    await prisma.platformSetting.update({
      where: { id: "singleton" },
      data: { maxLockedStakeKobo: CAP, maxDailyStakeKobo: CAP },
    });
    const battle = await newBattle(user.id, CAP);

    await expect(lock(user.id, CAP, { battleId: battle.id })).resolves.toBeUndefined();
  });
});

/**
 * The other side of the same numbers: `stakeBudget` is what the challenge form
 * and the Responsible play tab show a player. Its whole job is to be the same
 * arithmetic `lockStake` refuses with — a readout that says there is room and
 * then refuses the stake is worse than showing nothing at all, so the first
 * test below does not check the four figures against literals; it checks them
 * against what `lockStake` actually does with the next kobo.
 */
describe("stakeBudget — the figures the readout shows", () => {
  it("reports exactly what lockStake enforces: the room it describes is the room that exists", async () => {
    const user = await createTestUser({ walletBalance: 100_000_000 });
    await battleStakes(user.id, 2, CAP, "OPEN"); // ₦200,000 at risk

    const budget = await stakeBudget(prisma, user.id);
    expect(budget).toMatchObject({
      lockedTotal: 2 * CAP,
      maxLocked: TEST_LIMITS.maxLockedStakeKobo,
      maxDaily: TEST_LIMITS.maxDailyStakeKobo,
    });

    // Stake exactly the gap the readout describes — the last kobo of it is
    // allowed.
    const headroom = budget.maxLocked - budget.lockedTotal;
    const exact = await newBattle(user.id, headroom);
    await expect(lock(user.id, headroom, { battleId: exact.id })).resolves.toBeUndefined();

    // And one kobo past it is refused. Both numbers came from the same row, so
    // if the readout and the refusal ever drifted apart this is where it shows.
    const over = await newBattle(user.id, 1);
    await expect(lock(user.id, headroom + 1, { battleId: over.id })).rejects.toMatchObject({ code: "LOCKED_TOTAL" });
  });

  it("counts a host's unaccepted challenge as in play, and drops it once the challenge is cancelled", async () => {
    // The same gap the wallet page's held-in-challenges figure has: a host's
    // stake is locked before any Battle exists, so a sum over the battle
    // relation alone reports nothing at risk while the money is gone.
    const user = await createTestUser({ walletBalance: 100_000_000 });
    await pendingChallengeStakes(user.id, 2, CAP);

    expect((await stakeBudget(prisma, user.id)).lockedTotal).toBe(2 * CAP);

    // Cancelling refunds, so the money stops being at risk — but the stake
    // still happened, so the 24-hour figure keeps it.
    await prisma.quickMatchChallenge.updateMany({ where: { hostId: user.id }, data: { status: "CANCELLED" } });
    const after = await stakeBudget(prisma, user.id);
    expect(after.lockedTotal).toBe(0);
    expect(after.dailyTotal).toBe(2 * CAP);
  });

  it("stops counting a settled Battle as in play but keeps counting it in the 24 hours", async () => {
    // These are two different questions and the readout shows them as two
    // lines: what is at risk now, and what has gone through today. A figure
    // that answered both with one number would understate one of them.
    const user = await createTestUser({ walletBalance: 100_000_000 });
    await battleStakes(user.id, 2, CAP, "COMPLETE");

    const budget = await stakeBudget(prisma, user.id);
    expect(budget.lockedTotal).toBe(0);
    expect(budget.dailyTotal).toBe(2 * CAP);
  });

  it("does not count a stake older than the rolling window", async () => {
    // The mirror of the test above, so the 24-hour line can't pass by counting
    // every stake the account has ever made.
    const user = await createTestUser({ walletBalance: 100_000_000 });
    await battleStakes(user.id, 2, CAP, "COMPLETE", new Date(Date.now() - 25 * 3_600_000));

    expect((await stakeBudget(prisma, user.id)).dailyTotal).toBe(0);
  });

  it("reads the ceilings off the settings row, and falls back when there is no row to read", async () => {
    // A fresh database (and every test in this file before its beforeEach) has
    // no singleton. The fallbacks are what the code enforces then, so the
    // readout has to report those same ones.
    const user = await createTestUser({ walletBalance: 100_000_000 });

    const fromRow = await stakeBudget(prisma, user.id);
    expect(fromRow.maxLocked).toBe(TEST_LIMITS.maxLockedStakeKobo);
    expect(fromRow.maxDaily).toBe(TEST_LIMITS.maxDailyStakeKobo);

    const noRow = await stakeBudget(prisma, user.id, null);
    expect(noRow.maxLocked).toBe(DEFAULT_MAX_LOCKED_STAKE);
    expect(noRow.maxDaily).toBe(DEFAULT_MAX_DAILY_STAKE);
  });

  it("uses the settings row it is handed rather than reading one of its own", async () => {
    // This is the path lockStake takes: it has the row already (it reads it at
    // the top for the kill switch) and passes it through, so the ceilings it
    // refuses with are from the same read as the switch it refuses with. If
    // this argument were ignored, every stake would be judged against a
    // re-read row while the switch came from the first one.
    const user = await createTestUser({ walletBalance: 100_000_000 });

    const budget = await stakeBudget(prisma, user.id, { maxLockedStakeKobo: 1_234_567, maxDailyStakeKobo: 7_654_321 });
    expect(budget).toMatchObject({ maxLocked: 1_234_567, maxDaily: 7_654_321 });
  });
});
