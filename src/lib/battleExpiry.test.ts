import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { closeOpenBattle, expireOpenBattles } from "./battles";
import { battleExpiresAt, parseExpiryHours } from "./battleExpiry";
import { createTestUser, cleanupAll } from "@/testHelpers";

/**
 * An unaccepted Challenge closes in one place (closeOpenBattle). Whatever
 * closes it, a staked creator gets the stake back exactly once.
 */

afterEach(async () => {
  await cleanupAll();
});

const HOUR = 60 * 60 * 1000;

async function openBattle(opts: { stake?: number; createdAgoHours?: number; expiresInHours?: number | null } = {}) {
  const creator = await createTestUser({ walletBalance: 0 });
  const stake = opts.stake ?? 0;
  const createdAt = new Date(Date.now() - (opts.createdAgoHours ?? 0) * HOUR);
  const battle = await prisma.battle.create({
    data: {
      creatorId: creator.id,
      game: "Test Game",
      format: "SINGLE",
      stakeAmount: stake,
      status: "OPEN",
      createdAt,
      expiresAt: opts.expiresInHours === null ? null : new Date(Date.now() + (opts.expiresInHours ?? 72) * HOUR),
    },
  });
  return { creator, battle };
}

describe("closeOpenBattle", () => {
  it("returns a staked creator's stake once, however many times it's closed", async () => {
    const { creator, battle } = await openBattle({ stake: 50_000 });

    expect(await closeOpenBattle(battle.id, "EXPIRED")).toBe(true);
    expect(await closeOpenBattle(battle.id, "CANCELLED")).toBe(false);

    const after = await prisma.battle.findUniqueOrThrow({ where: { id: battle.id } });
    expect(after.status).toBe("EXPIRED");
    const refunds = await prisma.escrowTransaction.findMany({ where: { battleId: battle.id, type: "REFUND" } });
    expect(refunds).toHaveLength(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: creator.id } })).walletBalance).toBe(50_000);
  });

  it("doesn't touch an accepted challenge", async () => {
    const { battle } = await openBattle({ stake: 10_000 });
    await prisma.battle.update({ where: { id: battle.id }, data: { status: "ACCEPTED" } });
    expect(await closeOpenBattle(battle.id, "EXPIRED")).toBe(false);
    expect((await prisma.battle.findUniqueOrThrow({ where: { id: battle.id } })).status).toBe("ACCEPTED");
  });
});

describe("expireOpenBattles", () => {
  it("expires a lapsed challenge, refunds its stake and tells the creator", async () => {
    const { creator, battle } = await openBattle({ stake: 20_000, expiresInHours: -1 });

    const { expired } = await expireOpenBattles();
    expect(expired).toBeGreaterThanOrEqual(1);

    expect((await prisma.battle.findUniqueOrThrow({ where: { id: battle.id } })).status).toBe("EXPIRED");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: creator.id } })).walletBalance).toBe(20_000);
    const note = await prisma.notification.findFirst({ where: { userId: creator.id, type: "BATTLE_EXPIRED" } });
    expect(note).not.toBeNull();
  });

  it("leaves a challenge that hasn't lapsed alone", async () => {
    const { battle } = await openBattle({ expiresInHours: 24 });
    await expireOpenBattles();
    expect((await prisma.battle.findUniqueOrThrow({ where: { id: battle.id } })).status).toBe("OPEN");
  });

  it("treats a challenge from before expiry existed as lapsing after 7 days", async () => {
    const old = await openBattle({ createdAgoHours: 8 * 24, expiresInHours: null });
    const fresh = await openBattle({ createdAgoHours: 2 * 24, expiresInHours: null });
    await expireOpenBattles();
    expect((await prisma.battle.findUniqueOrThrow({ where: { id: old.battle.id } })).status).toBe("EXPIRED");
    expect((await prisma.battle.findUniqueOrThrow({ where: { id: fresh.battle.id } })).status).toBe("OPEN");
  });
});

describe("expiry rules", () => {
  it("accepts only the offered durations", () => {
    expect(parseExpiryHours(24)).toBe(24);
    expect(parseExpiryHours("72")).toBe(72);
    expect(parseExpiryHours(undefined)).toBe(72);
    expect(parseExpiryHours(5)).toBeNull();
  });

  it("falls back to 7 days after creation when no expiry was set", () => {
    const createdAt = new Date("2026-10-01T00:00:00Z");
    expect(battleExpiresAt({ createdAt, expiresAt: null }).toISOString()).toBe("2026-10-08T00:00:00.000Z");
    const set = new Date("2026-10-02T00:00:00Z");
    expect(battleExpiresAt({ createdAt, expiresAt: set })).toEqual(set);
  });
});
