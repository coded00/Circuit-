import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { cleanupAll, createTestUser } from "@/testHelpers";
import { MAX_STAKE_AMOUNT } from "@/lib/stakes";
import { DAY_MS } from "@/lib/selfExclusion";
import { POST } from "./route";

/**
 * Matching someone else's stake is staking. Before the stake limits lived in
 * `lockStake`, this route had its own copy of the debit and the escrow row —
 * so a limit added to the create path would have left this one wide open, and
 * an account at its limit could keep taking on stakes by accepting instead of
 * opening. These tests are the reason the accept path is not that.
 *
 * The other half of each case is what happens to the Battle: the OPEN →
 * ACCEPTED claim happens before the stake is locked, so a refusal has to put
 * the Battle back. One left ACCEPTED with no stake and no Match is a Battle
 * nobody can accept and nobody gets refunded for.
 */

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));

const CAP = MAX_STAKE_AMOUNT; // ₦100,000

const TEST_LIMITS = {
  stakedBattlesEnabled: true,
  maxLockedStakeKobo: 25_000_000, // ₦250,000
  maxDailyStakeKobo: 400_000_000, // high enough not to interfere
};

let original: {
  stakedBattlesEnabled: boolean;
  maxLockedStakeKobo: number;
  maxDailyStakeKobo: number;
} | null = null;

beforeEach(async () => {
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
  vi.restoreAllMocks();
  if (original) {
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: original });
  } else {
    await prisma.platformSetting.deleteMany({ where: { id: "singleton" } });
  }
  await cleanupAll();
});

const ADULT = new Date("1995-01-01T00:00:00.000Z");

/** An account cleared for the money gates: old enough, verified, funded. */
function stakeReadyUser(overrides = {}) {
  return createTestUser({ dateOfBirth: ADULT, emailVerifiedAt: new Date(), walletBalance: 100_000_000, ...overrides });
}

async function openStakedBattle(creatorId: string, stakeAmount = CAP) {
  const battle = await prisma.battle.create({
    data: {
      creatorId,
      game: "Test Game",
      format: "SINGLE",
      visibility: "OPEN",
      stakeAmount,
      status: "OPEN",
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  if (stakeAmount > 0) {
    await prisma.escrowTransaction.create({
      data: { battleId: battle.id, userId: creatorId, type: "STAKE", amount: stakeAmount, status: "COMPLETE" },
    });
  }
  return battle;
}

/** Gives `userId` `count` open staked Battles of their own, so they already hold that exposure. */
async function existingExposure(userId: string, count: number, amountEach = CAP) {
  for (let i = 0; i < count; i += 1) await openStakedBattle(userId, amountEach);
}

const accept = (battleId: string) =>
  POST(new Request(`http://localhost/api/battles/${battleId}/accept`, { method: "POST" }), {
    params: Promise.resolve({ id: battleId }),
  });

const stakeRowsFor = (userId: string, battleId: string) =>
  prisma.escrowTransaction.count({ where: { userId, battleId, type: "STAKE" } });

describe("accepting a staked Battle under the per-account limits", () => {
  it("refuses an accepter who is already at their at-once limit, and reopens the Battle", async () => {
    const creator = await stakeReadyUser();
    const accepter = await stakeReadyUser();
    // ₦200,000 already at risk, against a ₦250,000 limit: taking this
    // ₦100,000 Battle would be ₦300,000.
    await existingExposure(accepter.id, 2);
    const battle = await openStakedBattle(creator.id);
    vi.mocked(getCurrentUser).mockResolvedValue(accepter);

    const response = await accept(battle.id);

    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: string }).error).toMatch(/limit/i);
    // The stake was never taken...
    expect(await stakeRowsFor(accepter.id, battle.id)).toBe(0);
    // ...and the Battle is back where it started, not stranded ACCEPTED.
    expect((await prisma.battle.findUniqueOrThrow({ where: { id: battle.id } })).status).toBe("OPEN");
    expect(await prisma.match.count({ where: { battleId: battle.id } })).toBe(0);
  });

  it("refuses an accepter while staking is switched off", async () => {
    // The kill switch has to stop the accept path too, or "off" only means
    // "no new Battles" and every open staked Battle is still takeable.
    const creator = await stakeReadyUser();
    const accepter = await stakeReadyUser();
    const battle = await openStakedBattle(creator.id);
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: { stakedBattlesEnabled: false } });
    vi.mocked(getCurrentUser).mockResolvedValue(accepter);

    const response = await accept(battle.id);

    expect(response.status).toBe(403);
    expect(await stakeRowsFor(accepter.id, battle.id)).toBe(0);
    expect((await prisma.battle.findUniqueOrThrow({ where: { id: battle.id } })).status).toBe("OPEN");
  });

  it("refuses an accepter whose own cool-off is running, and reopens the Battle", async () => {
    // The cool-off is enforced in `lockStake`, the same place the limits are,
    // so it covers accepting someone else's stake for the same reason it
    // covers opening your own. This is the test that says so out loud: a
    // second enforcement point would be a second place to forget.
    const creator = await stakeReadyUser();
    const accepter = await stakeReadyUser({ selfExcludedUntil: new Date(Date.now() + DAY_MS) });
    const battle = await openStakedBattle(creator.id);
    vi.mocked(getCurrentUser).mockResolvedValue(accepter);

    const response = await accept(battle.id);

    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: string }).error).toMatch(/paused staked Battles/i);
    expect(await stakeRowsFor(accepter.id, battle.id)).toBe(0);
    expect((await prisma.battle.findUniqueOrThrow({ where: { id: battle.id } })).status).toBe("OPEN");
    expect(await prisma.match.count({ where: { battleId: battle.id } })).toBe(0);
  });

  it("still accepts normally when the accepter is within their limits", async () => {
    // Guard test: the compensation above must not fire on a good accept.
    const creator = await stakeReadyUser();
    const accepter = await stakeReadyUser();
    const battle = await openStakedBattle(creator.id);
    vi.mocked(getCurrentUser).mockResolvedValue(accepter);

    const response = await accept(battle.id);

    expect(response.status).toBe(201);
    expect(await stakeRowsFor(accepter.id, battle.id)).toBe(1);
    expect((await prisma.battle.findUniqueOrThrow({ where: { id: battle.id } })).status).toBe("ACCEPTED");
    expect(await prisma.match.count({ where: { battleId: battle.id } })).toBe(1);
  });
});
