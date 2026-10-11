import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createDraft, publishChallenge, updateDraft } from "@/lib/dailyChallengeAdmin";
import { enterChallenge, newVerificationCode } from "@/lib/dailyChallengeEntries";
import { reviewSubmission, submitScore } from "@/lib/dailyChallengeSubmissions";
import { cleanupAll, createTestCompetition, createTestStaff, createTestUser } from "@/testHelpers";

/**
 * Prize categories end to end through the staff code and the database: that what an admin sends is saved with every
 * reference resolved, that the publish rules (funding, recording, weapon) hold, that the database itself refuses to let a
 * published challenge's rules or prizes move, and that review treats a category-only requirement and the minimum score
 * the way the model says.
 */

vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 });

const HOUR = 3_600_000;
const NAIRA = 100;
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082", "hex");

let saved: Record<string, unknown> | null = null;
beforeAll(async () => {
  const s = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  saved = s ? { dailyChallengesEnabled: s.dailyChallengesEnabled, maxChallengeEntryFeeKobo: s.maxChallengeEntryFeeKobo, maxChallengeEntrants: s.maxChallengeEntrants, maxChallengePayoutBps: s.maxChallengePayoutBps } : null;
  await prisma.platformSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", dailyChallengesEnabled: true, maxChallengeEntryFeeKobo: 200_000, maxChallengeEntrants: 100, maxChallengePayoutBps: 7000 },
    update: { dailyChallengesEnabled: true, maxChallengeEntryFeeKobo: 200_000, maxChallengeEntrants: 100, maxChallengePayoutBps: 7000 },
  });
});
afterAll(async () => {
  if (saved) await prisma.platformSetting.update({ where: { id: "singleton" }, data: saved });
});
afterEach(cleanupAll);

async function setup() {
  const staff = await createTestStaff();
  const { gameId } = await createTestCompetition();
  const body = (over: Record<string, unknown> = {}) => ({
    gameId,
    title: "TEST AK-47 Battle Royale",
    rules: "One Battle Royale match.",
    evidenceRequirements: "A screen recording.",
    requireRecording: true,
    kind: "WEAPON",
    weaponLabel: "AK-47",
    metricLabel: "AK-47 kills",
    entryFee: 100_000,
    minEntrants: 20,
    maxEntrants: 100,
    prizeSplit: [],
    entryOpensAt: new Date(Date.now() + HOUR).toISOString(),
    entryClosesAt: new Date(Date.now() + 5 * HOUR).toISOString(),
    windowStartsAt: new Date(Date.now() + 5 * HOUR).toISOString(),
    windowEndsAt: new Date(Date.now() + 7 * HOUR).toISOString(),
    submissionsCloseAt: new Date(Date.now() + 8 * HOUR).toISOString(),
    requirements: [
      { key: "win", kind: "CONDITION", label: "Win the match", gate: false },
      { key: "ak", kind: "TARGET", label: "AK-47 kills", threshold: 5, direction: "HIGHER", needsRecording: true },
    ],
    prizeCategories: [
      { key: "champ", name: "Champion", amount: 2_000 * NAIRA, requires: ["win"] },
      { key: "leader", name: "Kill Leader", amount: 2_000 * NAIRA, metricKey: "ak" },
      { key: "combo", name: "AK-47 Champion", amount: 10_000 * NAIRA, comboOf: ["champ", "leader"] },
    ],
    ...over,
  });
  return { staff, gameId, body };
}

describe("saving prize categories", () => {
  it("resolves every reference to a real id, in order", async () => {
    const { staff, body } = await setup();
    const r = await createDraft(body(), staff.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: r.id }, include: { requirements: { orderBy: { sortOrder: "asc" } }, prizeCategories: { orderBy: { sortOrder: "asc" } } } });
    expect(c.kind).toBe("WEAPON");
    expect(c.weaponLabel).toBe("AK-47");
    expect(c.noWinnerPolicy).toBe("HOUSE_KEEPS");
    const [win, ak] = c.requirements;
    expect(win).toMatchObject({ label: "Win the match", gate: false, needsRecording: false });
    expect(ak).toMatchObject({ label: "AK-47 kills", gate: true, needsRecording: true, threshold: 5 });
    const [champ, leader, combo] = c.prizeCategories;
    expect(champ).toMatchObject({ name: "Champion", amountKobo: 200_000, requiresRequirementIds: [win.id], metricRequirementId: null });
    expect(leader).toMatchObject({ name: "Kill Leader", metricRequirementId: ak.id });
    expect(combo.comboOfCategoryIds).toEqual([champ.id, leader.id]);
  });

  it("replaces them as a set on edit, and a bad set leaves the draft as it was", async () => {
    const { staff, body } = await setup();
    const r = await createDraft(body(), staff.id);
    if (!r.ok) throw new Error(r.error);
    expect((await updateDraft(r.id, body({ prizeCategories: [{ key: "only", name: "Only prize", amount: 5_000 * NAIRA }] }), staff.id)).ok).toBe(true);
    expect((await prisma.dailyChallengePrizeCategory.findMany({ where: { challengeId: r.id } })).map((p) => p.name)).toEqual(["Only prize"]);

    const bad = await updateDraft(r.id, body({ prizeCategories: [{ key: "x", name: "Broken", amount: 0 }] }), staff.id);
    expect(bad).toMatchObject({ ok: false });
    expect((await prisma.dailyChallengePrizeCategory.findMany({ where: { challengeId: r.id } })).map((p) => p.name)).toEqual(["Only prize"]);
  });

  it("refuses a category that ranks by something that isn't a target", async () => {
    const { staff, body } = await setup();
    const r = await createDraft(body({ prizeCategories: [{ key: "a", name: "A", amount: 1000, metricKey: "win" }] }), staff.id);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("number target") });
  });
});

describe("publishing", () => {
  it("publishes a funded weapon challenge with no per-entry platform fee, since the house keeps the rest", async () => {
    const { staff, body } = await setup();
    const r = await createDraft(body(), staff.id); // prizes total ₦14,000 = 70% of 20 × ₦1,000
    if (!r.ok) throw new Error(r.error);
    expect((await publishChallenge(r.id, staff.id)).ok).toBe(true);
    const c = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: r.id } });
    expect(c.status).toBe("SCHEDULED");
    expect(c.platformFeeBps).toBe(0);
  });

  it("refuses prizes the minimum field can't fund at the 70% cap", async () => {
    const { staff, body } = await setup();
    const r = await createDraft(body({ prizeCategories: [{ key: "a", name: "Big", amount: 14_001 * NAIRA }] }), staff.id);
    if (!r.ok) throw new Error(r.error);
    expect(await publishChallenge(r.id, staff.id)).toMatchObject({ ok: false, error: expect.stringContaining("₦14,000") });
    expect((await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("DRAFT");
  });

  it("refuses a weapon challenge, or a recording-only stat, without a recording requirement", async () => {
    const { staff, body } = await setup();
    const noRecording = await createDraft(body({ requireRecording: false }), staff.id);
    if (!noRecording.ok) throw new Error(noRecording.error);
    expect(await publishChallenge(noRecording.id, staff.id)).toMatchObject({ ok: false, error: expect.stringContaining("recording") });

    const skill = await createDraft(body({ kind: "SKILL", weaponLabel: null, requireRecording: false, requirements: [{ key: "hs", kind: "TARGET", label: "Headshots", threshold: 5, needsRecording: true }], prizeCategories: [{ key: "h", name: "Headshot Hunter", amount: 5_000 * NAIRA, metricKey: "hs" }] }), staff.id);
    if (!skill.ok) throw new Error(skill.error);
    expect(await publishChallenge(skill.id, staff.id)).toMatchObject({ ok: false, error: expect.stringContaining("Headshot Hunter") });
  });

  it("won't mix a rank split with categories", async () => {
    const { staff, body } = await setup();
    const r = await createDraft(body({ prizeSplit: [60, 40] }), staff.id);
    if (!r.ok) throw new Error(r.error);
    expect(await publishChallenge(r.id, staff.id)).toMatchObject({ ok: false, error: expect.stringContaining("not both") });
  });
});

describe("what the database refuses once a challenge is published", () => {
  async function published() {
    const { staff, body } = await setup();
    const r = await createDraft(body(), staff.id);
    if (!r.ok) throw new Error(r.error);
    expect((await publishChallenge(r.id, staff.id)).ok).toBe(true);
    return { id: r.id, staff };
  }

  it("freezes the rules, the money, the prize policy and the prizes", async () => {
    const { id } = await published();
    for (const data of [{ entryFee: 1 }, { weaponLabel: "Knife" }, { noWinnerPolicy: "REFUND_ENTRIES" as const }, { minScore: 1 }, { title: "Edited" }, { kind: "SKILL" as const }, { maxEntrants: 5 }]) {
      await expect(prisma.dailyChallenge.update({ where: { id }, data })).rejects.toThrow(/cannot be changed/);
    }
    const cat = await prisma.dailyChallengePrizeCategory.findFirstOrThrow({ where: { challengeId: id } });
    await expect(prisma.dailyChallengePrizeCategory.update({ where: { id: cat.id }, data: { amountKobo: 99_999_999 } })).rejects.toThrow(/cannot be changed/);
    await expect(prisma.dailyChallengePrizeCategory.delete({ where: { id: cat.id } })).rejects.toThrow(/cannot be changed/);
    await expect(prisma.dailyChallengePrizeCategory.create({ data: { challengeId: id, name: "Sneaky", amountKobo: 1 } })).rejects.toThrow(/cannot be changed/);
  });

  it("still lets the challenge make progress: status, pause, deadlines", async () => {
    const { id } = await published();
    const c = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id } });
    const moved = await prisma.dailyChallenge.update({ where: { id }, data: { status: "OPEN", pausedAt: new Date(), pausedReason: "x", windowEndsAt: new Date(c.windowEndsAt.getTime() + 1000), submissionsCloseAt: new Date(c.submissionsCloseAt.getTime() + 1000) } });
    expect(moved.status).toBe("OPEN");
  });
});

describe("the entry code", () => {
  it("is a six-character code with no look-alike letters, given to each entrant", async () => {
    for (let i = 0; i < 50; i++) expect(newVerificationCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    const { staff, gameId, body } = await setup();
    const r = await createDraft(body({ prizeCategories: [], entryFee: 0, minEntrants: 1 }), staff.id);
    if (!r.ok) throw new Error(r.error);
    await publishChallenge(r.id, staff.id, new Date(Date.now() + 2 * HOUR)); // opens as scheduled; force it open for entry
    await prisma.dailyChallenge.update({ where: { id: r.id }, data: { status: "OPEN", entryOpensAt: new Date(Date.now() - HOUR) } });
    const player = await createTestUser({ dateOfBirth: new Date("1995-01-01") });
    await prisma.userGameName.create({ data: { userId: player.id, gameId, name: "TEST-ign" } });
    const { entryId } = await enterChallenge({ userId: player.id, challengeId: r.id });
    const entry = await prisma.dailyChallengeEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(entry.verificationCode).toMatch(/^[A-Z2-9]{6}$/);
  });
});

describe("review with category-only requirements and a minimum score", () => {
  /** A live challenge: "win" is category-only, "ak" is a gate target, minimum score 5. Built as a draft, then moved on. */
  async function liveChallenge() {
    const { staff, body, gameId } = await setup();
    const r = await createDraft(body({ prizeCategories: [], minScore: 5, entryFee: 0, minEntrants: 1, requireRecording: true }), staff.id);
    if (!r.ok) throw new Error(r.error);
    await prisma.dailyChallenge.update({
      where: { id: r.id },
      data: { status: "OPEN", publishedAt: new Date(), entryOpensAt: new Date(Date.now() - 3 * HOUR), entryClosesAt: new Date(Date.now() - 2 * HOUR), windowStartsAt: new Date(Date.now() - 2 * HOUR), windowEndsAt: new Date(Date.now() + HOUR), submissionsCloseAt: new Date(Date.now() + 2 * HOUR) },
    });
    const player = await createTestUser({ dateOfBirth: new Date("1995-01-01") });
    await prisma.userGameName.create({ data: { userId: player.id, gameId, name: "TEST-ign" } });
    await enterChallenge({ userId: player.id, challengeId: r.id, now: new Date(Date.now() - 2.5 * HOUR) });
    await prisma.dailyChallenge.update({ where: { id: r.id }, data: { status: "LIVE" } });
    const reqs = await prisma.dailyChallengeRequirement.findMany({ where: { challengeId: r.id }, orderBy: { sortOrder: "asc" } });
    const reviewer = await createTestStaff();
    const evidence = { buffer: Buffer.concat([PNG, Buffer.from(player.id)]), contentType: "image/png" };
    return { id: r.id, player, reviewer, win: reqs[0], ak: reqs[1], evidence };
  }

  it("approves a score even when a category-only requirement wasn't met", async () => {
    const c = await liveChallenge();
    const { submissionId } = await submitScore({ userId: c.player.id, challengeId: c.id, score: 8, claims: [{ requirementId: c.win.id, claimedMet: false }, { requirementId: c.ak.id, claimedValue: 8 }], evidence: c.evidence, recording: c.evidence });
    const r = await reviewSubmission({ submissionId, reviewerId: c.reviewer.id, decision: "APPROVE", verifiedScore: 8, verdicts: [{ requirementId: c.win.id, met: false }, { requirementId: c.ak.id, verifiedValue: 8 }] });
    expect(r).toEqual({ status: "VERIFIED", entryStatus: "VERIFIED" });
    // The verdict on the category-only requirement is kept, for settlement to use.
    const result = await prisma.dailyChallengeRequirementResult.findFirstOrThrow({ where: { submissionId, requirementId: c.win.id } });
    expect(result.met).toBe(false);
  });

  it("refuses to approve a score below the minimum, but can reject it", async () => {
    const c = await liveChallenge();
    const { submissionId } = await submitScore({ userId: c.player.id, challengeId: c.id, score: 3, claims: [{ requirementId: c.win.id, claimedMet: true }, { requirementId: c.ak.id, claimedValue: 6 }], evidence: c.evidence, recording: c.evidence });
    const verdicts = [{ requirementId: c.win.id, met: true }, { requirementId: c.ak.id, verifiedValue: 6 }];
    await expect(reviewSubmission({ submissionId, reviewerId: c.reviewer.id, decision: "APPROVE", verifiedScore: 3, verdicts })).rejects.toMatchObject({ code: "INVALID", message: expect.stringContaining("below the minimum") });
    const r = await reviewSubmission({ submissionId, reviewerId: c.reviewer.id, decision: "REJECT", reasonCode: "SCORE_BELOW_MINIMUM", verdicts });
    expect(r.status).toBe("REJECTED");
  });
});
