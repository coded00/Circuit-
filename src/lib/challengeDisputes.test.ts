import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { raiseDispute, ruleDispute } from "@/lib/challengeDisputes";
import { advanceDailyChallenges } from "@/lib/dailyChallengeEntries";
import { reviewSubmission } from "@/lib/dailyChallengeSubmissions";
import { cleanupAll, createTestCompetition, createTestStaff, createTestUser } from "@/testHelpers";

/**
 * Disputes on provisional results: who can raise one and when, that a different person rules on it, that an upheld one
 * sends the submission back to review (to someone other than the first reviewer) and the challenge back to under review,
 * and that an open dispute keeps a challenge from being finalized however long it takes.
 */

vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 });

const HOUR = 3_600_000;
const MIN = 60_000;

let saved: boolean | null = null;
beforeAll(async () => {
  const s = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  saved = s?.dailyChallengesEnabled ?? null;
  await prisma.platformSetting.upsert({ where: { id: "singleton" }, create: { id: "singleton", dailyChallengesEnabled: true }, update: { dailyChallengesEnabled: true } });
});
afterAll(async () => {
  if (saved !== null) await prisma.platformSetting.update({ where: { id: "singleton" }, data: { dailyChallengesEnabled: saved } });
});
afterEach(cleanupAll);

/** A PROVISIONAL challenge with one rejected player, decided a moment ago by `reviewer`. */
async function provisional(over: { provisionalMinutesAgo?: number; submissionStatus?: "REJECTED" | "VERIFIED" | "PENDING" } = {}) {
  const creator = await createTestStaff();
  const reviewer = await createTestStaff();
  const { gameId } = await createTestCompetition();
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  const now = Date.now();
  const challenge = await prisma.dailyChallenge.create({
    data: {
      gameId,
      gameName: game.name,
      title: "TEST dispute",
      rules: "r",
      evidenceRequirements: "e",
      metricLabel: "Kills",
      entryFee: 0,
      minEntrants: 1,
      maxEntrants: 10,
      platformFeeBps: 0,
      status: "DRAFT",
      disputeWindowMinutes: 30,
      entryOpensAt: new Date(now - 6 * HOUR),
      entryClosesAt: new Date(now - 5 * HOUR),
      windowStartsAt: new Date(now - 5 * HOUR),
      windowEndsAt: new Date(now - 4 * HOUR),
      submissionsCloseAt: new Date(now - 3 * HOUR),
      createdById: creator.id,
      requirements: { create: [{ kind: "CONDITION", label: "Win the match", gate: true, sortOrder: 0 }] },
    },
    include: { requirements: true },
  });
  await prisma.dailyChallenge.update({ where: { id: challenge.id }, data: { status: "PROVISIONAL", provisionalAt: new Date(now - (over.provisionalMinutesAgo ?? 5) * MIN) } });

  const player = await createTestUser();
  const status = over.submissionStatus ?? "REJECTED";
  const entry = await prisma.dailyChallengeEntry.create({ data: { challengeId: challenge.id, userId: player.id, inGameName: "x", status: status === "VERIFIED" ? "VERIFIED" : status === "PENDING" ? "SUBMITTED" : "REJECTED" } });
  const sub = await prisma.dailyChallengeSubmission.create({
    data: { entryId: entry.id, score: 10, evidenceRef: "ref", evidenceMime: "image/png", evidenceHash: `h-${entry.id}`, status, verifiedScore: status === "VERIFIED" ? 10 : null, reviewedById: status === "PENDING" ? null : reviewer.id, reviewedAt: status === "PENDING" ? null : new Date() },
  });
  await prisma.dailyChallengeRequirementResult.create({ data: { submissionId: sub.id, requirementId: challenge.requirements[0].id, claimedMet: true, met: status === "PENDING" ? null : status === "VERIFIED" } });
  await prisma.dailyChallengeReview.create({ data: { submissionId: sub.id, reviewerId: reviewer.id, decision: "REJECT", reasonCode: "UNREADABLE" } });
  const second = await createTestStaff();
  return { challenge, player, entry, sub, reviewer, creator, second, requirement: challenge.requirements[0] };
}

describe("raising a dispute", () => {
  it("lets a player dispute a decision on their own submission while results are provisional", async () => {
    const c = await provisional();
    const { disputeId } = await raiseDispute({ userId: c.player.id, challengeId: c.challenge.id, reason: "The scoreboard was readable; I'd like it looked at again." });
    const d = await prisma.dailyChallengeDispute.findUniqueOrThrow({ where: { id: disputeId } });
    expect(d).toMatchObject({ status: "OPEN", raisedById: c.player.id, submissionId: c.sub.id });
  });

  it("refuses outside the window, at the wrong stage, with a thin reason, with nothing to dispute, or for an undecided submission", async () => {
    const closed = await provisional({ provisionalMinutesAgo: 31 });
    await expect(raiseDispute({ userId: closed.player.id, challengeId: closed.challenge.id, reason: "A perfectly good reason here." })).rejects.toMatchObject({ code: "NOT_REVIEWABLE", message: expect.stringContaining("window") });

    const c = await provisional();
    await expect(raiseDispute({ userId: c.player.id, challengeId: c.challenge.id, reason: "short" })).rejects.toMatchObject({ code: "INVALID" });
    await prisma.dailyChallenge.update({ where: { id: c.challenge.id }, data: { status: "UNDER_REVIEW" } });
    await expect(raiseDispute({ userId: c.player.id, challengeId: c.challenge.id, reason: "A perfectly good reason here." })).rejects.toMatchObject({ code: "NOT_REVIEWABLE" });
    await prisma.dailyChallenge.update({ where: { id: c.challenge.id }, data: { status: "PROVISIONAL" } });

    const stranger = await createTestUser();
    await expect(raiseDispute({ userId: stranger.id, challengeId: c.challenge.id, reason: "A perfectly good reason here." })).rejects.toMatchObject({ code: "NOT_ENTERED" });

    const pending = await provisional({ submissionStatus: "PENDING" });
    await expect(raiseDispute({ userId: pending.player.id, challengeId: pending.challenge.id, reason: "A perfectly good reason here." })).rejects.toMatchObject({ code: "NOT_REVIEWABLE" });
  });

  it("allows only one open dispute per submission, even from a double tap", async () => {
    const c = await provisional();
    const results = await Promise.allSettled([
      raiseDispute({ userId: c.player.id, challengeId: c.challenge.id, reason: "A perfectly good reason here." }),
      raiseDispute({ userId: c.player.id, challengeId: c.challenge.id, reason: "A perfectly good reason here." }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.dailyChallengeDispute.count({ where: { submissionId: c.sub.id } })).toBe(1);
  });
});

describe("ruling on a dispute", () => {
  async function disputed() {
    const c = await provisional();
    const { disputeId } = await raiseDispute({ userId: c.player.id, challengeId: c.challenge.id, reason: "The scoreboard was readable; please look again." });
    return { ...c, disputeId };
  }

  it("needs a different person from the one who made the decision, and a written ruling", async () => {
    const c = await disputed();
    await expect(ruleDispute({ disputeId: c.disputeId, reviewerId: c.reviewer.id, outcome: "UPHELD", ruling: "Fine, I was wrong." })).rejects.toMatchObject({ code: "SELF_REVIEW" });
    await expect(ruleDispute({ disputeId: c.disputeId, reviewerId: c.second.id, outcome: "UPHELD", ruling: "no" })).rejects.toMatchObject({ code: "INVALID" });
    expect((await prisma.dailyChallengeDispute.findUniqueOrThrow({ where: { id: c.disputeId } })).status).toBe("OPEN");
  });

  it("dismissed: the decision stands, the challenge stays provisional, and the player is told", async () => {
    const c = await disputed();
    expect(await ruleDispute({ disputeId: c.disputeId, reviewerId: c.second.id, outcome: "DISMISSED", ruling: "The scoreboard really is unreadable." })).toEqual({ upheld: false });
    expect((await prisma.dailyChallengeSubmission.findUniqueOrThrow({ where: { id: c.sub.id } })).status).toBe("REJECTED");
    expect((await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: c.challenge.id } })).status).toBe("PROVISIONAL");
    expect(await prisma.notification.count({ where: { userId: c.player.id, type: "DAILY_CHALLENGE_DISPUTE_RULED" } })).toBe(1);
    await expect(ruleDispute({ disputeId: c.disputeId, reviewerId: c.second.id, outcome: "UPHELD", ruling: "Changed my mind." })).rejects.toMatchObject({ code: "ALREADY_REVIEWED" });
  });

  it("upheld: back to review — verdicts cleared, the entry reopened, the challenge no longer provisional", async () => {
    const c = await disputed();
    expect(await ruleDispute({ disputeId: c.disputeId, reviewerId: c.second.id, outcome: "UPHELD", ruling: "It was readable; it needs another look." })).toEqual({ upheld: true });

    const sub = await prisma.dailyChallengeSubmission.findUniqueOrThrow({ where: { id: c.sub.id }, include: { requirementResults: true } });
    expect(sub).toMatchObject({ status: "PENDING", verifiedScore: null, reviewedById: null });
    expect(sub.score).toBe(10); // what the player claimed is untouched
    expect(sub.requirementResults[0]).toMatchObject({ met: null, claimedMet: true });
    expect((await prisma.dailyChallengeEntry.findUniqueOrThrow({ where: { id: c.entry.id } })).status).toBe("SUBMITTED");
    const challenge = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: c.challenge.id } });
    expect(challenge).toMatchObject({ status: "UNDER_REVIEW", provisionalAt: null });
    // The first review is still on the record.
    expect(await prisma.dailyChallengeReview.count({ where: { submissionId: c.sub.id } })).toBe(1);
  });

  it("then needs somebody other than the first reviewer to decide it again", async () => {
    const c = await disputed();
    await ruleDispute({ disputeId: c.disputeId, reviewerId: c.second.id, outcome: "UPHELD", ruling: "It was readable; it needs another look." });
    const verdicts = [{ requirementId: c.requirement.id, met: true }];
    await expect(reviewSubmission({ submissionId: c.sub.id, reviewerId: c.reviewer.id, decision: "APPROVE", verifiedScore: 10, verdicts })).rejects.toMatchObject({ code: "SELF_REVIEW", message: expect.stringContaining("different reviewer") });
    const r = await reviewSubmission({ submissionId: c.sub.id, reviewerId: c.second.id, decision: "APPROVE", verifiedScore: 10, verdicts });
    expect(r.status).toBe("VERIFIED");
  });
});

describe("an open dispute and the sweep", () => {
  it("keeps the challenge provisional past the dispute window until it is ruled on, then lets it finalize", async () => {
    const c = await provisional({ provisionalMinutesAgo: 5 });
    const { disputeId } = await raiseDispute({ userId: c.player.id, challengeId: c.challenge.id, reason: "The scoreboard was readable; please look again." });

    const later = new Date(Date.now() + 5 * HOUR);
    await advanceDailyChallenges(later, { only: [c.challenge.id] });
    expect((await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: c.challenge.id } })).status).toBe("PROVISIONAL");

    await ruleDispute({ disputeId, reviewerId: c.second.id, outcome: "DISMISSED", ruling: "The scoreboard really is unreadable." });
    await advanceDailyChallenges(later, { only: [c.challenge.id] });
    const done = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: c.challenge.id } });
    expect(done.status).toBe("FINALIZED");
    expect(done.finalizedAt).not.toBeNull();
  });
});
