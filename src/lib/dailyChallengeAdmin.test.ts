import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { cancelChallenge, createDraft, deleteDraft, pauseChallenge, publishChallenge, resumeChallenge, updateDraft } from "@/lib/dailyChallengeAdmin";
import { cleanupAll, createTestCompetition, createTestStaff, createTestUser } from "@/testHelpers";

/**
 * The staff lifecycle against a real database: what a draft can become, what a second staff member pressing the
 * same button at the same moment gets, and the database's own walls (the timeline CHECK, the append-only guards)
 * that hold even if this code is wrong. Runs against the shared dev database like the rest of the integration
 * tests, with the platform switch turned on for the duration and put back after.
 */

// These run against a remote database and each test cleans up after itself, so they are slow. A generous
// per-test limit keeps a slow network from reading as a failure.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 });

const HOUR = 3_600_000;
const iso = (offsetHours: number, base = Date.now()) => new Date(base + offsetHours * HOUR).toISOString();

let saved: { dailyChallengesEnabled: boolean; maxChallengeEntryFeeKobo: number; maxChallengeEntrants: number } | null = null;

beforeAll(async () => {
  const s = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  saved = s ? { dailyChallengesEnabled: s.dailyChallengesEnabled, maxChallengeEntryFeeKobo: s.maxChallengeEntryFeeKobo, maxChallengeEntrants: s.maxChallengeEntrants } : null;
  await prisma.platformSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", dailyChallengesEnabled: true, maxChallengeEntryFeeKobo: 200_000, maxChallengeEntrants: 50 },
    update: { dailyChallengesEnabled: true, maxChallengeEntryFeeKobo: 200_000, maxChallengeEntrants: 50 },
  });
});

afterAll(async () => {
  if (saved) await prisma.platformSetting.update({ where: { id: "singleton" }, data: saved });
  else await prisma.platformSetting.update({ where: { id: "singleton" }, data: { dailyChallengesEnabled: false } }).catch(() => {});
});

afterEach(cleanupAll);

async function setup() {
  const staff = await createTestStaff();
  const { gameId, gameModeId } = await createTestCompetition();
  const body = (over: Record<string, unknown> = {}) => ({
    gameId,
    title: "TEST most kills",
    rules: "Ranked Hardpoint, any map.",
    evidenceRequirements: "Match-end scoreboard screenshot.",
    metricLabel: "Kills",
    entryFee: 100_000,
    minEntrants: 2,
    maxEntrants: 10,
    prizeSplit: [60, 40],
    entryOpensAt: iso(1),
    entryClosesAt: iso(5),
    windowStartsAt: iso(5),
    windowEndsAt: iso(7),
    submissionsCloseAt: iso(8),
    ...over,
  });
  return { staff, gameId, gameModeId, body };
}

async function draft(over: Record<string, unknown> = {}) {
  const s = await setup();
  const r = await createDraft(s.body(over), s.staff.id);
  if (!r.ok) throw new Error(r.error);
  return { ...s, id: r.id };
}

describe("createDraft", () => {
  it("saves a draft with the game's name snapshotted and the platform fee at the time", async () => {
    const { id, gameId } = await draft();
    const c = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id } });
    const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
    expect(c.status).toBe("DRAFT");
    expect(c.gameName).toBe(game.name);
    expect(c.entryFee).toBe(100_000);
    expect(c.prizeSplit).toEqual([60, 40]);
    expect(await prisma.auditLogEntry.count({ where: { action: "dailyChallenge.create", targetId: id } })).toBe(1);
  });

  it("refuses a game that is not published, and a mode from another game", async () => {
    const s = await setup();
    await prisma.game.update({ where: { id: s.gameId }, data: { publishedAt: null } });
    const unpublished = await createDraft(s.body(), s.staff.id);
    expect(unpublished).toMatchObject({ ok: false, status: 400 });

    await prisma.game.update({ where: { id: s.gameId }, data: { publishedAt: new Date() } });
    const other = await createTestCompetition();
    const wrongMode = await createDraft(s.body({ gameModeId: other.gameModeId }), s.staff.id);
    expect(wrongMode).toMatchObject({ ok: false, error: expect.stringContaining("doesn't belong") });
    const rightMode = await createDraft(s.body({ gameModeId: s.gameModeId }), s.staff.id);
    expect(rightMode.ok).toBe(true);
  });

  it("holds a fee to the pilot ceiling", async () => {
    const s = await setup();
    expect(await createDraft(s.body({ entryFee: 200_100 }), s.staff.id)).toMatchObject({ ok: false });
  });

  it("can be saved while the platform switch is off — only publishing is gated", async () => {
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: { dailyChallengesEnabled: false } });
    try {
      const s = await setup();
      const r = await createDraft(s.body(), s.staff.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(await publishChallenge(r.id, s.staff.id)).toMatchObject({ ok: false, error: expect.stringContaining("switched off") });
    } finally {
      await prisma.platformSetting.update({ where: { id: "singleton" }, data: { dailyChallengesEnabled: true } });
    }
  });
});

describe("updateDraft and deleteDraft", () => {
  it("edits a draft and refuses to edit or delete a published challenge", async () => {
    const { id, staff, body } = await draft();
    expect((await updateDraft(id, body({ title: "TEST renamed" }), staff.id)).ok).toBe(true);
    expect((await prisma.dailyChallenge.findUniqueOrThrow({ where: { id } })).title).toBe("TEST renamed");

    expect((await publishChallenge(id, staff.id)).ok).toBe(true);
    expect(await updateDraft(id, body({ title: "TEST sneaky" }), staff.id)).toMatchObject({ ok: false, status: 409 });
    expect(await deleteDraft(id, staff.id)).toMatchObject({ ok: false, status: 409 });
    expect((await prisma.dailyChallenge.findUniqueOrThrow({ where: { id } })).title).toBe("TEST renamed");
  });

  it("deletes a draft", async () => {
    const { id, staff } = await draft();
    expect((await deleteDraft(id, staff.id)).ok).toBe(true);
    expect(await prisma.dailyChallenge.findUnique({ where: { id } })).toBeNull();
    expect(await deleteDraft(id, staff.id)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("publishChallenge", () => {
  it("schedules a challenge whose entries are still ahead, and freezes the fee in force", async () => {
    const { id, staff } = await draft();
    await prisma.dailyChallenge.update({ where: { id }, data: { platformFeeBps: 1 } });
    const r = await publishChallenge(id, staff.id);
    expect(r).toMatchObject({ ok: true, status: "SCHEDULED" });
    const c = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id } });
    expect(c.status).toBe("SCHEDULED");
    expect(c.publishedAt).not.toBeNull();
    expect(c.platformFeeBps).toBe((await prisma.platformSetting.findUniqueOrThrow({ where: { id: "singleton" } })).platformFeeBps);
  });

  it("opens straight away when entries were already due", async () => {
    const { id, staff } = await draft();
    const c = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id } });
    const r = await publishChallenge(id, staff.id, new Date(c.entryOpensAt.getTime() + 60_000));
    expect(r).toMatchObject({ ok: true, status: "OPEN" });
  });

  it("refuses once entries would already be closed", async () => {
    const { id, staff } = await draft();
    const c = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id } });
    expect(await publishChallenge(id, staff.id, new Date(c.entryClosesAt.getTime() + 1))).toMatchObject({ ok: false, error: expect.stringContaining("already be closed") });
  });

  it("refuses a fee that is above the ceiling as it stands now, even for an older draft", async () => {
    const { id, staff } = await draft();
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: { maxChallengeEntryFeeKobo: 50_000 } });
    try {
      expect(await publishChallenge(id, staff.id)).toMatchObject({ ok: false, error: expect.stringContaining("above the current limit") });
    } finally {
      await prisma.platformSetting.update({ where: { id: "singleton" }, data: { maxChallengeEntryFeeKobo: 200_000 } });
    }
  });

  it("lets exactly one of two simultaneous publishes win", async () => {
    const { id, staff } = await draft();
    const other = await createTestStaff();
    const results = await Promise.all([publishChallenge(id, staff.id), publishChallenge(id, other.id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    expect(await prisma.auditLogEntry.count({ where: { action: "dailyChallenge.publish", targetId: id } })).toBe(1);
  });

  it("refuses a challenge that is not a draft", async () => {
    const { id, staff } = await draft();
    await publishChallenge(id, staff.id);
    expect(await publishChallenge(id, staff.id)).toMatchObject({ ok: false, status: 409 });
  });
});

describe("pause and resume", () => {
  it("needs a reason, and only applies to something that is running", async () => {
    const { id, staff } = await draft();
    expect(await pauseChallenge(id, "x", staff.id)).toMatchObject({ ok: false });
    expect(await pauseChallenge(id, "Servers are down", staff.id)).toMatchObject({ ok: false, status: 409 }); // still a draft
    await publishChallenge(id, staff.id);
    expect((await pauseChallenge(id, "Servers are down", staff.id)).ok).toBe(true);
    expect(await pauseChallenge(id, "Again", staff.id)).toMatchObject({ ok: false, status: 409 });
    const c = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id } });
    expect(c.pausedAt).not.toBeNull();
    expect(c.pausedReason).toBe("Servers are down");
  });

  it("gives the paused time back to the deadlines that were still ahead", async () => {
    const { id, staff } = await draft();
    await publishChallenge(id, staff.id);
    const before = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id } });
    const pausedAt = new Date(Date.now() - 30 * 60_000);
    await prisma.dailyChallenge.update({ where: { id }, data: { pausedAt, pausedReason: "test" } });

    const r = await resumeChallenge(id, staff.id, new Date(pausedAt.getTime() + 30 * 60_000));
    expect(r).toMatchObject({ ok: true, shiftedMinutes: 30 });
    const after = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id } });
    expect(after.pausedAt).toBeNull();
    expect(after.pausedReason).toBeNull();
    expect(after.entryOpensAt.getTime() - before.entryOpensAt.getTime()).toBe(30 * 60_000);
    expect(after.windowEndsAt.getTime() - before.windowEndsAt.getTime()).toBe(30 * 60_000);
    // The order the database insists on survived the shift.
    expect(after.entryClosesAt <= after.windowStartsAt && after.windowStartsAt < after.windowEndsAt && after.windowEndsAt <= after.submissionsCloseAt).toBe(true);
    expect(await resumeChallenge(id, staff.id)).toMatchObject({ ok: false, status: 409 });
  });
});

describe("cancelChallenge", () => {
  it("cancels a challenge nobody entered, with the reason kept", async () => {
    const { id, staff } = await draft();
    await publishChallenge(id, staff.id);
    expect((await cancelChallenge(id, "Prize funding fell through", staff.id)).ok).toBe(true);
    const c = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id } });
    expect(c.status).toBe("CANCELLED");
    expect(c.cancelledReason).toBe("Prize funding fell through");
    expect(c.cancelledAt).not.toBeNull();
    expect(await cancelChallenge(id, "Again", staff.id)).toMatchObject({ ok: false, status: 409 });
  });

  it("refunds every entry when a challenge that has entries is cancelled", async () => {
    const { id, staff } = await draft();
    await publishChallenge(id, staff.id);
    const player = await createTestUser({ walletBalance: 0 });
    await prisma.dailyChallengeEntry.create({ data: { challengeId: id, userId: player.id, inGameName: "TEST-player" } });
    const r = await cancelChallenge(id, "Changed my mind", staff.id);
    expect(r).toMatchObject({ ok: true, refunded: 1 });
    expect((await prisma.dailyChallenge.findUniqueOrThrow({ where: { id } })).status).toBe("CANCELLED");
    expect((await prisma.dailyChallengeEntry.findFirstOrThrow({ where: { challengeId: id } })).status).toBe("REFUNDED");
  });

  it("needs a reason, and cannot cancel once the standings are locked", async () => {
    const { id, staff } = await draft();
    await publishChallenge(id, staff.id);
    expect(await cancelChallenge(id, "", staff.id)).toMatchObject({ ok: false });
    await prisma.dailyChallenge.update({ where: { id }, data: { status: "FINALIZED" } });
    expect(await cancelChallenge(id, "Too late", staff.id)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("locked") });
  });
});

describe("the database's own walls", () => {
  it("refuses a timeline that is out of order, whatever the application said", async () => {
    const { id } = await draft();
    const c = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id } });
    await expect(prisma.dailyChallenge.update({ where: { id }, data: { windowStartsAt: new Date(c.entryClosesAt.getTime() - 60_000) } })).rejects.toThrow();
    await expect(prisma.dailyChallenge.update({ where: { id }, data: { maxEntrants: 1, minEntrants: 2 } })).rejects.toThrow();
  });

  it("refuses to re-point a challenge's ledger row at a different challenge, but lets an empty link be filled", async () => {
    const a = await draft();
    const b = await draft();
    const row = await prisma.escrowTransaction.create({ data: { userId: a.staff.id, type: "CHALLENGE_ENTRY", amount: 100, status: "COMPLETE" } });
    const filled = await prisma.escrowTransaction.update({ where: { id: row.id }, data: { dailyChallengeId: a.id } });
    expect(filled.dailyChallengeId).toBe(a.id);
    await expect(prisma.escrowTransaction.update({ where: { id: row.id }, data: { dailyChallengeId: b.id } })).rejects.toThrow(/append-only/);
    await expect(prisma.escrowTransaction.update({ where: { id: row.id }, data: { amount: 999 } })).rejects.toThrow(/append-only/);
  });

  it("refuses to edit a review once it is written", async () => {
    const { id, staff } = await draft();
    const player = await createTestUser();
    const entry = await prisma.dailyChallengeEntry.create({ data: { challengeId: id, userId: player.id, inGameName: "TEST-player" } });
    const sub = await prisma.dailyChallengeSubmission.create({ data: { entryId: entry.id, score: 10, evidenceRef: "ref", evidenceMime: "image/png", evidenceHash: "abc" } });
    const review = await prisma.dailyChallengeReview.create({ data: { submissionId: sub.id, reviewerId: staff.id, decision: "APPROVE" } });
    await expect(prisma.dailyChallengeReview.update({ where: { id: review.id }, data: { decision: "REJECT" } })).rejects.toThrow(/append-only/);
  });
});
