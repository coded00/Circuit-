/**
 * Circuit — disputes on a Daily Challenge's provisional results (docs/daily-challenges-spec.md §6, §11).
 *
 * While results are provisional, a player can dispute the decision on their own submission — a rejection, a
 * disqualification, or a score staff changed. A different staff member rules on it. If it is upheld the submission goes
 * back to review (and the challenge back to UNDER_REVIEW, so nothing is final until it is decided again, by someone other
 * than the first reviewer); if it is dismissed the decision stands. An open dispute stops the challenge being finalized,
 * however long the window — the sweep checks for it — and nothing is paid until it is ruled.
 */

import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/auditLog";
import { notify, notifyStaff } from "@/lib/notifications";
import { ChallengeRefusedError } from "@/lib/dailyChallengeEntries";

export const MIN_REASON = 10;
export const MAX_REASON = 1000;

export async function raiseDispute(opts: { userId: string; challengeId: string; reason: unknown; now?: Date }): Promise<{ disputeId: string }> {
  const now = opts.now ?? new Date();
  const reason = typeof opts.reason === "string" ? opts.reason.trim() : "";
  if (reason.length < MIN_REASON) throw new ChallengeRefusedError("INVALID", `Say why you disagree, in at least ${MIN_REASON} characters — a reviewer reads exactly this.`, 400);
  if (reason.length > MAX_REASON) throw new ChallengeRefusedError("INVALID", `Keep it to ${MAX_REASON} characters.`, 400);

  const challenge = await prisma.dailyChallenge.findUnique({ where: { id: opts.challengeId }, select: { id: true, title: true, status: true, provisionalAt: true, disputeWindowMinutes: true } });
  if (!challenge) throw new ChallengeRefusedError("NOT_FOUND", "Challenge not found.", 404);
  if (challenge.status !== "PROVISIONAL") throw new ChallengeRefusedError("NOT_REVIEWABLE", "Disputes can only be raised while the results are provisional.");
  if (!challenge.provisionalAt || now.getTime() >= challenge.provisionalAt.getTime() + challenge.disputeWindowMinutes * 60_000) {
    throw new ChallengeRefusedError("NOT_REVIEWABLE", "The dispute window has closed.");
  }

  const submission = await prisma.dailyChallengeSubmission.findFirst({ where: { entry: { challengeId: challenge.id, userId: opts.userId } }, select: { id: true, status: true } });
  if (!submission) throw new ChallengeRefusedError("NOT_ENTERED", "You didn't submit a score for this challenge, so there's no decision to dispute.");
  if (submission.status === "PENDING") throw new ChallengeRefusedError("NOT_REVIEWABLE", "Your submission hasn't been decided yet.");

  try {
    const dispute = await prisma.dailyChallengeDispute.create({ data: { submissionId: submission.id, raisedById: opts.userId, reason } });
    await notifyStaff("DAILY_CHALLENGE_DISPUTE_RAISED", { challengeId: challenge.id, title: challenge.title, disputeId: dispute.id }).catch(() => {});
    return { disputeId: dispute.id };
  } catch (err) {
    // The partial unique index: one open dispute per submission.
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") {
      throw new ChallengeRefusedError("ALREADY_REVIEWED", "You already have a dispute open on this decision.");
    }
    throw err;
  }
}

export async function ruleDispute(opts: { disputeId: string; reviewerId: string; outcome: "UPHELD" | "DISMISSED"; ruling: unknown }): Promise<{ upheld: boolean }> {
  const ruling = typeof opts.ruling === "string" ? opts.ruling.trim() : "";
  if (ruling.length < 5) throw new ChallengeRefusedError("INVALID", "Write the ruling — the player is told, and it's what an appeal is judged against.", 400);

  const dispute = await prisma.dailyChallengeDispute.findUnique({
    where: { id: opts.disputeId },
    include: { submission: { include: { entry: { include: { challenge: { select: { id: true, title: true, status: true } } } } } } },
  });
  if (!dispute) throw new ChallengeRefusedError("NOT_FOUND", "Dispute not found.", 404);
  if (dispute.status !== "OPEN") throw new ChallengeRefusedError("ALREADY_REVIEWED", "This dispute has already been ruled on.");
  const { submission } = dispute;
  const challenge = submission.entry.challenge;
  if (challenge.status !== "PROVISIONAL") throw new ChallengeRefusedError("NOT_REVIEWABLE", "This challenge is no longer provisional, so the dispute can't be ruled on.");

  // A different pair of eyes: not the person who raised it, and not the reviewer whose decision is being questioned.
  if (opts.reviewerId === dispute.raisedById) throw new ChallengeRefusedError("SELF_REVIEW", "You raised this dispute, so you can't rule on it.", 403);
  if (opts.reviewerId === submission.reviewedById) throw new ChallengeRefusedError("SELF_REVIEW", "You made the decision being disputed. A different staff member has to rule on it.", 403);

  const upheld = opts.outcome === "UPHELD";
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DailyChallenge" WHERE id = ${challenge.id} FOR UPDATE`;
    const { count } = await tx.dailyChallengeDispute.updateMany({
      where: { id: dispute.id, status: "OPEN" },
      data: { status: upheld ? "UPHELD" : "DISMISSED", ruling, ruledById: opts.reviewerId, ruledAt: new Date() },
    });
    if (count === 0) throw new ChallengeRefusedError("ALREADY_REVIEWED", "Someone else ruled on this dispute first.");
    if (!upheld) return;

    // Upheld: back to review. The earlier verdicts are cleared so the next reviewer decides afresh; the player's own claim,
    // the evidence and the whole history of reviews are untouched (they are append-only and frozen).
    await tx.dailyChallengeSubmission.update({ where: { id: submission.id }, data: { status: "PENDING", verifiedScore: null, verifiedTiebreakScore: null, reviewedById: null, reviewedAt: null } });
    await tx.dailyChallengeRequirementResult.updateMany({ where: { submissionId: submission.id }, data: { met: null, verifiedValue: null } });
    await tx.dailyChallengeEntry.update({ where: { id: submission.entryId }, data: { status: "SUBMITTED" } });
    // Nothing is provisional any more until every submission is decided again.
    await tx.dailyChallenge.updateMany({ where: { id: challenge.id, status: "PROVISIONAL" }, data: { status: "UNDER_REVIEW", provisionalAt: null } });
  });

  await logAdminAction({ actorId: opts.reviewerId, action: upheld ? "dailyChallenge.disputeUpheld" : "dailyChallenge.disputeDismissed", targetType: "DailyChallengeDispute", targetId: dispute.id, metadata: { challengeId: challenge.id, ruling } });
  await notify(dispute.raisedById, "DAILY_CHALLENGE_DISPUTE_RULED", { challengeId: challenge.id, title: challenge.title, upheld, ruling }).catch(() => {});
  return { upheld };
}
