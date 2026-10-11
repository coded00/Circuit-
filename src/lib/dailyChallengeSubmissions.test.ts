import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { proofStorage } from "@/lib/storage";
import { enterChallenge, ChallengeRefusedError } from "@/lib/dailyChallengeEntries";
import { createDraft, publishChallenge, updateDraft } from "@/lib/dailyChallengeAdmin";
import { reviewSubmission, submitScore } from "@/lib/dailyChallengeSubmissions";
import { cleanupAll, createTestCompetition, createTestStaff, createTestUser } from "@/testHelpers";

/**
 * A player's submission is evidence, and a reviewer's decision is a record. These pin down both: what a submission
 * has to carry, that it can only be made once and only in time, that nothing about it can be edited afterwards (the
 * database refuses, whatever the code says), and that a decision follows the requirements — an approval cannot stand
 * on a requirement that wasn't met, and a target's verdict is worked out from the number a reviewer read, never from
 * what the form claims.
 */

// These run against a remote database and each test cleans up after itself, so they are slow. A generous
// per-test limit keeps a slow network from reading as a failure.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 });

const HOUR = 3_600_000;
const FEE = 100_000;
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082", "hex");
const png = (tag = "") => ({ buffer: Buffer.concat([PNG, Buffer.from(tag)]), contentType: "image/png" });

let saved: Record<string, unknown> | null = null;
beforeAll(async () => {
  const s = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  saved = s ? { dailyChallengesEnabled: s.dailyChallengesEnabled, maxChallengeEntryFeeKobo: s.maxChallengeEntryFeeKobo, maxChallengeEntrants: s.maxChallengeEntrants } : null;
  await prisma.platformSetting.upsert({ where: { id: "singleton" }, create: { id: "singleton", dailyChallengesEnabled: true }, update: { dailyChallengesEnabled: true } });
});
afterAll(async () => {
  if (saved) await prisma.platformSetting.update({ where: { id: "singleton" }, data: saved });
});
afterEach(cleanupAll);

/**
 * A challenge in the requested state (LIVE by default) with a condition and a target. Requirements can only be added
 * while a challenge is a draft — the database refuses otherwise, which is the point — so it is created as a draft with
 * its requirements and then moved to the state under test, the way a real one gets there.
 */
async function liveChallenge(over: Record<string, unknown> = {}, withRequirements = true) {
  const staff = await createTestStaff();
  const { gameId } = await createTestCompetition();
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  const now = Date.now();
  const { status: wanted = "LIVE", ...rest } = over as { status?: "DRAFT" | "LIVE" | "OPEN" | "SCHEDULED" };
  const created = await prisma.dailyChallenge.create({
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
      platformFeeBps: 1000,
      status: "DRAFT",
      entryOpensAt: new Date(now - 3 * HOUR),
      entryClosesAt: new Date(now - 2 * HOUR),
      windowStartsAt: new Date(now - 2 * HOUR),
      windowEndsAt: new Date(now + HOUR),
      submissionsCloseAt: new Date(now + 2 * HOUR),
      createdById: staff.id,
      ...rest,
      ...(withRequirements
        ? {
            requirements: {
              create: [
                { kind: "CONDITION", label: "Win the match", sortOrder: 0 },
                { kind: "TARGET", label: "Damage", direction: "HIGHER", threshold: 1000, unit: "damage", sortOrder: 1 },
              ],
            },
          }
        : {}),
    },
  });
  if (wanted !== "DRAFT") await prisma.dailyChallenge.update({ where: { id: created.id }, data: { status: wanted } });
  const challenge = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: created.id }, include: { requirements: { orderBy: { sortOrder: "asc" } } } });
  return { challenge, staff, gameId, condition: challenge.requirements[0], target: challenge.requirements[1] };
}

/**
 * An entered player. Entries are only taken while a challenge is OPEN, so a challenge under test (usually LIVE) is
 * opened for the entry, with a clock from before the window — which is when a real player entered — and put back as it was.
 */
async function enteredPlayer(challengeId: string, gameId: string) {
  const user = await createTestUser({ walletBalance: 1_000_000, dateOfBirth: new Date("1995-01-01") });
  await prisma.userGameName.create({ data: { userId: user.id, gameId, name: `TEST-ign-${user.handle}` } });
  const before = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: challengeId }, select: { status: true } });
  if (before.status !== "OPEN") await prisma.dailyChallenge.update({ where: { id: challengeId }, data: { status: "OPEN" } });
  try {
    await enterChallenge({ userId: user.id, challengeId, now: new Date(Date.now() - 2.5 * HOUR) });
  } finally {
    if (before.status !== "OPEN") await prisma.dailyChallenge.update({ where: { id: challengeId }, data: { status: before.status } });
  }
  return user;
}

const claimsFor = (c: { condition: { id: string }; target: { id: string } }, met = true, damage = 1500) => [
  { requirementId: c.condition.id, claimedMet: met },
  { requirementId: c.target.id, claimedValue: damage },
];

async function submit(c: Awaited<ReturnType<typeof liveChallenge>>, userId: string, over: Record<string, unknown> = {}) {
  return submitScore({ userId, challengeId: c.challenge.id, score: 18, claims: claimsFor(c), evidence: png(userId), ...over } as Parameters<typeof submitScore>[0]);
}

describe("submitScore", () => {
  it("stores the submission, the claims and the file, and moves the entry on", async () => {
    const c = await liveChallenge();
    const p = await enteredPlayer(c.challenge.id, c.gameId);
    const { submissionId } = await submit(c, p.id);

    const sub = await prisma.dailyChallengeSubmission.findUniqueOrThrow({ where: { id: submissionId }, include: { entry: true, requirementResults: true } });
    expect(sub.score).toBe(18);
    expect(sub.status).toBe("PENDING");
    expect(sub.evidenceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sub.submittedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(sub.entry.status).toBe("SUBMITTED");
    expect(sub.requirementResults).toHaveLength(2);
    expect(sub.requirementResults.find((r) => r.requirementId === c.condition.id)?.claimedMet).toBe(true);
    expect(sub.requirementResults.find((r) => r.requirementId === c.target.id)?.claimedValue).toBe(1500);
    const stored = await proofStorage.read(sub.evidenceRef);
    expect(stored.buffer.equals(png(p.id).buffer)).toBe(true);
  });

  it("accepts only one submission per entry, even from a double tap", async () => {
    const c = await liveChallenge();
    const p = await enteredPlayer(c.challenge.id, c.gameId);
    const results = await Promise.allSettled([submit(c, p.id), submit(c, p.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(ChallengeRefusedError);
    expect(await prisma.dailyChallengeSubmission.count({ where: { entry: { challengeId: c.challenge.id } } })).toBe(1);
  });

  it("refuses a late score by the server clock, before the window, when paused, and from someone who didn't enter", async () => {
    const c = await liveChallenge();
    const p = await enteredPlayer(c.challenge.id, c.gameId);
    await expect(submit(c, p.id, { now: new Date(c.challenge.submissionsCloseAt.getTime() + 1) })).rejects.toMatchObject({ code: "SUBMISSIONS_CLOSED" });
    await expect(submit(c, p.id, { now: new Date(c.challenge.windowStartsAt.getTime() - 1) })).rejects.toMatchObject({ code: "NOT_LIVE" });
    await prisma.dailyChallenge.update({ where: { id: c.challenge.id }, data: { pausedAt: new Date() } });
    await expect(submit(c, p.id)).rejects.toMatchObject({ code: "PAUSED" });
    await prisma.dailyChallenge.update({ where: { id: c.challenge.id }, data: { pausedAt: null } });
    const stranger = await createTestUser();
    await expect(submit(c, stranger.id)).rejects.toMatchObject({ code: "NOT_ENTERED" });
    expect(await prisma.dailyChallengeSubmission.count({ where: { entry: { challengeId: c.challenge.id } } })).toBe(0);
  });

  it("refuses a score that isn't a whole number, a missing answer, and a missing recording — and stores nothing", async () => {
    const c = await liveChallenge({ requireRecording: true, tiebreakLabel: "Deaths" });
    const p = await enteredPlayer(c.challenge.id, c.gameId);
    const base = { tiebreakScore: 3, recording: png("rec") };
    await expect(submit(c, p.id, { ...base, score: -1 })).rejects.toMatchObject({ code: "INVALID" });
    await expect(submit(c, p.id, { ...base, score: 1.5 })).rejects.toMatchObject({ code: "INVALID" });
    await expect(submit(c, p.id, { ...base, score: "" })).rejects.toMatchObject({ code: "INVALID" });
    await expect(submit(c, p.id, { ...base, tiebreakScore: undefined })).rejects.toMatchObject({ code: "INVALID" });
    await expect(submit(c, p.id, { ...base, claims: [{ requirementId: c.condition.id, claimedMet: true }] })).rejects.toMatchObject({ code: "INVALID" });
    await expect(submit(c, p.id, { ...base, recording: null })).rejects.toMatchObject({ code: "INVALID", message: expect.stringContaining("recording") });
    expect(await prisma.dailyChallengeSubmission.count({ where: { entry: { challengeId: c.challenge.id } } })).toBe(0);
    expect((await prisma.dailyChallengeEntry.findFirstOrThrow({ where: { challengeId: c.challenge.id } })).status).toBe("ENTERED");
    // And the same player can still submit properly afterwards.
    expect((await submit(c, p.id, base)).submissionId).toBeTruthy();
  });

  it("records the same file used twice, so a reviewer can see it", async () => {
    const c = await liveChallenge();
    const a = await enteredPlayer(c.challenge.id, c.gameId);
    const b = await enteredPlayer(c.challenge.id, c.gameId);
    const same = png("one-screenshot");
    await submit(c, a.id, { evidence: same });
    await submit(c, b.id, { evidence: same });
    const subs = await prisma.dailyChallengeSubmission.findMany({ where: { entry: { challengeId: c.challenge.id } } });
    expect(subs).toHaveLength(2);
    expect(subs[0].evidenceHash).toBe(subs[1].evidenceHash);
  });
});

describe("what the database refuses", () => {
  it("won't let a submission's score or file change after it is written, but lets the review move", async () => {
    const c = await liveChallenge();
    const p = await enteredPlayer(c.challenge.id, c.gameId);
    const { submissionId } = await submit(c, p.id);
    await expect(prisma.dailyChallengeSubmission.update({ where: { id: submissionId }, data: { score: 99 } })).rejects.toThrow(/evidence/);
    await expect(prisma.dailyChallengeSubmission.update({ where: { id: submissionId }, data: { evidenceHash: "x" } })).rejects.toThrow(/evidence/);
    await expect(prisma.dailyChallengeSubmission.update({ where: { id: submissionId }, data: { submittedAt: new Date(0) } })).rejects.toThrow(/evidence/);
    const moved = await prisma.dailyChallengeSubmission.update({ where: { id: submissionId }, data: { status: "VERIFIED", verifiedScore: 18 } });
    expect(moved.status).toBe("VERIFIED");
  });

  it("won't let a claim change, but lets the verdict be set", async () => {
    const c = await liveChallenge();
    const p = await enteredPlayer(c.challenge.id, c.gameId);
    const { submissionId } = await submit(c, p.id);
    const row = await prisma.dailyChallengeRequirementResult.findFirstOrThrow({ where: { submissionId, requirementId: c.target.id } });
    await expect(prisma.dailyChallengeRequirementResult.update({ where: { id: row.id }, data: { claimedValue: 9999 } })).rejects.toThrow(/claimed/);
    const ok = await prisma.dailyChallengeRequirementResult.update({ where: { id: row.id }, data: { met: true, verifiedValue: 1500 } });
    expect(ok.met).toBe(true);
  });

  it("freezes a challenge's requirements once it is published, but lets a draft's change and delete", async () => {
    const c = await liveChallenge(); // LIVE: not a draft
    await expect(prisma.dailyChallengeRequirement.create({ data: { challengeId: c.challenge.id, kind: "CONDITION", label: "Sneaky" } })).rejects.toThrow(/published/);
    await expect(prisma.dailyChallengeRequirement.update({ where: { id: c.condition.id }, data: { label: "Changed" } })).rejects.toThrow(/published/);
    await expect(prisma.dailyChallengeRequirement.delete({ where: { id: c.condition.id } })).rejects.toThrow(/published/);

    const d = await liveChallenge({ status: "DRAFT" }, false);
    const req = await prisma.dailyChallengeRequirement.create({ data: { challengeId: d.challenge.id, kind: "CONDITION", label: "Fine" } });
    await prisma.dailyChallengeRequirement.update({ where: { id: req.id }, data: { label: "Still fine" } });
    await prisma.dailyChallengeRequirement.delete({ where: { id: req.id } });
  });

  it("refuses a requirement of the wrong shape", async () => {
    const d = await liveChallenge({ status: "DRAFT" }, false);
    await expect(prisma.dailyChallengeRequirement.create({ data: { challengeId: d.challenge.id, kind: "TARGET", label: "No number" } })).rejects.toThrow();
    await expect(prisma.dailyChallengeRequirement.create({ data: { challengeId: d.challenge.id, kind: "CONDITION", label: "Has number", threshold: 5, direction: "HIGHER" } })).rejects.toThrow();
  });
});

describe("saving requirements with a draft", () => {
  it("stores them in order, replaces them as a set on edit, and freezes them at publish", async () => {
    const staff = await createTestStaff();
    const { gameId } = await createTestCompetition();
    const body = (requirements: unknown) => ({
      gameId,
      title: "TEST with requirements",
      rules: "r",
      evidenceRequirements: "e",
      metricLabel: "Kills",
      entryFee: 0,
      minEntrants: 1,
      maxEntrants: 10,
      prizeSplit: [],
      entryOpensAt: new Date(Date.now() + HOUR).toISOString(),
      entryClosesAt: new Date(Date.now() + 5 * HOUR).toISOString(),
      windowStartsAt: new Date(Date.now() + 5 * HOUR).toISOString(),
      windowEndsAt: new Date(Date.now() + 7 * HOUR).toISOString(),
      submissionsCloseAt: new Date(Date.now() + 8 * HOUR).toISOString(),
      requirements,
    });
    const created = await createDraft(body([{ kind: "CONDITION", label: "Win" }, { kind: "TARGET", label: "Kills", threshold: 10 }]), staff.id);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const list = () => prisma.dailyChallengeRequirement.findMany({ where: { challengeId: created.id }, orderBy: { sortOrder: "asc" } });
    expect((await list()).map((r) => [r.label, r.kind, r.threshold])).toEqual([["Win", "CONDITION", null], ["Kills", "TARGET", 10]]);

    expect((await updateDraft(created.id, body([{ kind: "CONDITION", label: "Only this" }]), staff.id)).ok).toBe(true);
    expect((await list()).map((r) => r.label)).toEqual(["Only this"]);

    // A bad list leaves the draft exactly as it was.
    expect(await updateDraft(created.id, body([{ kind: "TARGET", label: "Broken" }]), staff.id)).toMatchObject({ ok: false });
    expect((await list()).map((r) => r.label)).toEqual(["Only this"]);

    expect((await publishChallenge(created.id, staff.id)).ok).toBe(true);
    await expect(prisma.dailyChallengeRequirement.deleteMany({ where: { challengeId: created.id } })).rejects.toThrow(/published/);
  });
});

describe("reviewSubmission", () => {
  async function pending(over: { met?: boolean; damage?: number; challengeOver?: Record<string, unknown> } = {}) {
    const c = await liveChallenge(over.challengeOver ?? {});
    const p = await enteredPlayer(c.challenge.id, c.gameId);
    const { submissionId } = await submit(c, p.id, { claims: claimsFor(c, over.met ?? true, over.damage ?? 1500) });
    const reviewer = await createTestStaff();
    return { ...c, player: p, submissionId, reviewer };
  }
  const verdicts = (c: { condition: { id: string }; target: { id: string } }, met = true, damage = 1500) => [
    { requirementId: c.condition.id, met },
    { requirementId: c.target.id, verifiedValue: damage },
  ];

  it("approves a verified score: the submission and entry are verified, and it is on the record", async () => {
    const c = await pending();
    const r = await reviewSubmission({ submissionId: c.submissionId, reviewerId: c.reviewer.id, decision: "APPROVE", verdicts: verdicts(c), verifiedScore: 18 });
    expect(r).toEqual({ status: "VERIFIED", entryStatus: "VERIFIED" });
    const sub = await prisma.dailyChallengeSubmission.findUniqueOrThrow({ where: { id: c.submissionId }, include: { reviews: true, requirementResults: true } });
    expect(sub.status).toBe("VERIFIED");
    expect(sub.verifiedScore).toBe(18);
    expect(sub.reviewedById).toBe(c.reviewer.id);
    expect(sub.reviews).toHaveLength(1);
    expect(sub.reviews[0]).toMatchObject({ decision: "APPROVE", scoreBefore: 18, scoreAfter: 18 });
    expect(sub.requirementResults.every((x) => x.met === true)).toBe(true);
    expect(await prisma.notification.count({ where: { userId: c.player.id, type: "DAILY_CHALLENGE_SCORE_VERIFIED" } })).toBe(1);
    expect(await prisma.auditLogEntry.count({ where: { actorId: c.reviewer.id, action: "dailyChallenge.review", targetId: c.submissionId } })).toBe(1);
  });

  it("records a corrected score as a correction, keeping what the player claimed", async () => {
    const c = await pending();
    await reviewSubmission({ submissionId: c.submissionId, reviewerId: c.reviewer.id, decision: "APPROVE", verdicts: verdicts(c), verifiedScore: 15 });
    const sub = await prisma.dailyChallengeSubmission.findUniqueOrThrow({ where: { id: c.submissionId }, include: { reviews: true } });
    expect(sub.score).toBe(18); // the claim is untouched
    expect(sub.verifiedScore).toBe(15); // what ranks
    expect(sub.reviews[0]).toMatchObject({ decision: "CORRECT", scoreBefore: 18, scoreAfter: 15 });
  });

  it("works out a target's verdict from the number the reviewer read — a lie in the form cannot approve it", async () => {
    const c = await pending({ damage: 1500 });
    // The reviewer read 900 off the screenshot; the target is at least 1000. Whatever 'met' a client sends is ignored.
    const forged = [
      { requirementId: c.condition.id, met: true },
      { requirementId: c.target.id, verifiedValue: 900, met: true },
    ];
    await expect(reviewSubmission({ submissionId: c.submissionId, reviewerId: c.reviewer.id, decision: "APPROVE", verdicts: forged, verifiedScore: 18 })).rejects.toMatchObject({ code: "INVALID", message: expect.stringContaining("isn't met") });
    expect((await prisma.dailyChallengeSubmission.findUniqueOrThrow({ where: { id: c.submissionId } })).status).toBe("PENDING");
  });

  it("rejects for a missed requirement, naming it, and leaves the fee where it is", async () => {
    const c = await pending({ met: false });
    await reviewSubmission({ submissionId: c.submissionId, reviewerId: c.reviewer.id, decision: "REJECT", reasonCode: "REQUIREMENT_NOT_MET", verdicts: verdicts(c, false) });
    const sub = await prisma.dailyChallengeSubmission.findUniqueOrThrow({ where: { id: c.submissionId }, include: { reviews: true, entry: true } });
    expect(sub.status).toBe("REJECTED");
    expect(sub.entry.status).toBe("REJECTED");
    expect(sub.reviews[0].note).toBe("Not met: Win the match.");
    expect(sub.verifiedScore).toBeNull();
    // Rejection keeps the fee, as the challenge page says: no refund rows were written.
    expect(await prisma.escrowTransaction.count({ where: { dailyChallengeEntryId: sub.entryId, type: "CHALLENGE_REFUND" } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: c.player.id, type: "DAILY_CHALLENGE_SCORE_REJECTED" } })).toBe(1);
  });

  it("refuses an approval with a requirement left unanswered, and a missed-requirement reason when none was missed", async () => {
    const c = await pending();
    await expect(reviewSubmission({ submissionId: c.submissionId, reviewerId: c.reviewer.id, decision: "APPROVE", verdicts: [{ requirementId: c.target.id, verifiedValue: 1500 }], verifiedScore: 18 })).rejects.toMatchObject({ code: "INVALID" });
    await expect(reviewSubmission({ submissionId: c.submissionId, reviewerId: c.reviewer.id, decision: "REJECT", reasonCode: "REQUIREMENT_NOT_MET", verdicts: verdicts(c) })).rejects.toMatchObject({ code: "INVALID", message: expect.stringContaining("No requirement") });
    await expect(reviewSubmission({ submissionId: c.submissionId, reviewerId: c.reviewer.id, decision: "REJECT", verdicts: verdicts(c) })).rejects.toMatchObject({ code: "INVALID", message: expect.stringContaining("reason") });
  });

  it("disqualifies only with a written explanation, and marks the entry disqualified", async () => {
    const c = await pending();
    await expect(reviewSubmission({ submissionId: c.submissionId, reviewerId: c.reviewer.id, decision: "DISQUALIFY", reasonCode: "EDITED_OR_FAKE", verdicts: verdicts(c) })).rejects.toMatchObject({ code: "INVALID" });
    const r = await reviewSubmission({ submissionId: c.submissionId, reviewerId: c.reviewer.id, decision: "DISQUALIFY", reasonCode: "EDITED_OR_FAKE", note: "The kill count has been edited in.", verdicts: verdicts(c) });
    expect(r.entryStatus).toBe("DISQUALIFIED");
  });

  it("will not let you review your own entry, review twice, or review at the wrong stage", async () => {
    const c = await pending();
    await expect(reviewSubmission({ submissionId: c.submissionId, reviewerId: c.player.id, decision: "APPROVE", verdicts: verdicts(c), verifiedScore: 18 })).rejects.toMatchObject({ code: "SELF_REVIEW" });
    await prisma.dailyChallenge.update({ where: { id: c.challenge.id }, data: { status: "PROVISIONAL" } });
    await expect(reviewSubmission({ submissionId: c.submissionId, reviewerId: c.reviewer.id, decision: "APPROVE", verdicts: verdicts(c), verifiedScore: 18 })).rejects.toMatchObject({ code: "NOT_REVIEWABLE" });
    await prisma.dailyChallenge.update({ where: { id: c.challenge.id }, data: { status: "UNDER_REVIEW" } });
    await reviewSubmission({ submissionId: c.submissionId, reviewerId: c.reviewer.id, decision: "APPROVE", verdicts: verdicts(c), verifiedScore: 18 });
    await expect(reviewSubmission({ submissionId: c.submissionId, reviewerId: c.reviewer.id, decision: "REJECT", reasonCode: "UNREADABLE", verdicts: verdicts(c) })).rejects.toMatchObject({ code: "ALREADY_REVIEWED" });
  });

  it("lets exactly one of two reviewers win when they decide at the same moment", async () => {
    const c = await pending();
    const other = await createTestStaff();
    const results = await Promise.allSettled([
      reviewSubmission({ submissionId: c.submissionId, reviewerId: c.reviewer.id, decision: "APPROVE", verdicts: verdicts(c), verifiedScore: 18 }),
      reviewSubmission({ submissionId: c.submissionId, reviewerId: other.id, decision: "REJECT", reasonCode: "UNREADABLE", verdicts: verdicts(c) }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.dailyChallengeReview.count({ where: { submissionId: c.submissionId } })).toBe(1);
  });

  it("needs a verified tie-break stat when the challenge has one", async () => {
    // A challenge with a tie-break also needs the player's tie-break number to submit, so build it directly.
    const d = await liveChallenge({ tiebreakLabel: "Deaths" });
    const p = await enteredPlayer(d.challenge.id, d.gameId);
    const { submissionId } = await submit(d, p.id, { tiebreakScore: 4 });
    const reviewer = await createTestStaff();
    await expect(reviewSubmission({ submissionId, reviewerId: reviewer.id, decision: "APPROVE", verdicts: verdicts(d), verifiedScore: 18 })).rejects.toMatchObject({ code: "INVALID", message: expect.stringContaining("tie-break") });
    await reviewSubmission({ submissionId, reviewerId: reviewer.id, decision: "APPROVE", verdicts: verdicts(d), verifiedScore: 18, verifiedTiebreak: 5 });
    expect((await prisma.dailyChallengeSubmission.findUniqueOrThrow({ where: { id: submissionId } })).verifiedTiebreakScore).toBe(5);
  });
});
