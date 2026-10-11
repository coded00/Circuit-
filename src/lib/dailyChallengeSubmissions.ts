/**
 * Circuit — Daily Challenge submissions and their review (docs/daily-challenges-spec.md §6, §6b).
 *
 * A player submits once per entry: a score, a screenshot of the scoreboard (and a recording where the challenge
 * asks for one), and an answer for every requirement. Staff then check the evidence by hand, requirement by
 * requirement, and either approve a verified score or reject / disqualify with a reason. Only an approved
 * submission ranks.
 *
 * What a player submitted is evidence, and is frozen the moment it is written (a database trigger holds the line
 * if this code is ever wrong). What staff decide is a separate, append-only record: every review is a new row with
 * the reason, the score before and after, and the reviewer — a change of mind is another row.
 *
 * Nothing here moves money. A rejected or disqualified entry keeps its fee forfeited, as the challenge page says up
 * front; a mistaken rejection is put right on a dispute (step 5), which is where a refund or a reinstatement happens.
 */

import { evidenceFlags, readEvidenceMeta } from "@/lib/evidenceCheck";
import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/auditLog";
import { notify } from "@/lib/notifications";
import { proofStorage } from "@/lib/storage";
import {
  REQUIREMENT_NOT_MET,
  REVIEW_REASON_LABEL,
  evaluateRequirements,
  isReviewReasonCode,
  parseRequirementClaims,
  reviewRefusal,
  submitRefusal,
  targetMet,
  type ReviewDecision,
} from "@/lib/dailyChallenges";
import { ChallengeRefusedError } from "@/lib/dailyChallengeEntries";
import { meetsMinimumScore } from "@/lib/challengePrizes";

export const MAX_SCORE = 1_000_000;

export type EvidenceFile = { buffer: Buffer; contentType: string };

function wholeScore(raw: unknown, label: string): number {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_SCORE) {
    throw new ChallengeRefusedError("INVALID", `${label} must be a whole number from 0 to ${MAX_SCORE.toLocaleString("en-NG")}.`, 400);
  }
  return n;
}

async function lockChallenge(tx: Prisma.TransactionClient, challengeId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "DailyChallenge" WHERE id = ${challengeId} FOR UPDATE`;
}

// ---------------------------------------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------------------------------------

export async function submitScore(opts: {
  userId: string;
  challengeId: string;
  score: unknown;
  tiebreakScore?: unknown;
  claims: unknown;
  evidence: EvidenceFile;
  recording?: EvidenceFile | null;
  now?: Date;
}): Promise<{ submissionId: string }> {
  const now = opts.now ?? new Date();

  const challenge = await prisma.dailyChallenge.findUnique({
    where: { id: opts.challengeId },
    include: { requirements: { orderBy: { sortOrder: "asc" } } },
  });
  if (!challenge) throw new ChallengeRefusedError("NOT_FOUND", "Challenge not found.", 404);
  const entry = await prisma.dailyChallengeEntry.findUnique({
    where: { challengeId_userId: { challengeId: challenge.id, userId: opts.userId } },
    include: { submission: { select: { id: true } } },
  });

  const refusal = submitRefusal({ challenge, entryStatus: entry?.status ?? "NONE", hasSubmission: !!entry?.submission, now });
  if (refusal || !entry) throw new ChallengeRefusedError(refusal?.code ?? "NOT_ENTERED", refusal?.message ?? "You're not in this challenge.");

  // Everything the player typed is validated before a byte is stored.
  const score = wholeScore(opts.score, `Your ${challenge.metricLabel.toLowerCase()}`);
  const tiebreakScore = challenge.tiebreakLabel ? wholeScore(opts.tiebreakScore, `Your ${challenge.tiebreakLabel.toLowerCase()}`) : null;
  const claims = parseRequirementClaims(opts.claims, challenge.requirements);
  if (!claims.ok) throw new ChallengeRefusedError("INVALID", claims.error, 400);
  if (challenge.requireRecording && !opts.recording) throw new ChallengeRefusedError("INVALID", "This challenge also needs a screen recording.", 400);

  // Advisory only: what the file says about when it was taken. Flags help a reviewer; they never block a submission.
  const meta = await readEvidenceMeta(opts.evidence.buffer);
  const flags = evidenceFlags(meta, { windowStartsAt: challenge.windowStartsAt, submissionsCloseAt: challenge.submissionsCloseAt, uploadedAt: now });

  const hash = createHash("sha256").update(opts.evidence.buffer).digest("hex");
  // Stored before the row exists, under a reference only the server knows. If the transaction below loses a race
  // the file is simply unreferenced — harmless, and never reachable.
  const scope = `dc-${entry.id}`;
  const evidenceRef = await proofStorage.store(scope, opts.evidence.buffer, opts.evidence.contentType);
  const recordingRef = opts.recording ? await proofStorage.store(scope, opts.recording.buffer, opts.recording.contentType) : null;

  try {
    const submission = await prisma.$transaction(async (tx) => {
      await lockChallenge(tx, challenge.id);
      // Re-read under the lock: the deadline, a pause or a cancel may have landed while the files uploaded.
      const fresh = await tx.dailyChallenge.findUnique({ where: { id: challenge.id } });
      if (!fresh) throw new ChallengeRefusedError("NOT_FOUND", "Challenge not found.", 404);
      // The same clock as the first check: the real one in production, and whatever the caller gave in tests.
      const again = submitRefusal({ challenge: fresh, entryStatus: "ENTERED", hasSubmission: false, now: opts.now ?? new Date() });
      if (again) throw new ChallengeRefusedError(again.code, again.message);

      // The server's own clock is the submission time (the column's default), never anything the browser sent.
      const created = await tx.dailyChallengeSubmission.create({
        data: {
          entryId: entry.id,
          score,
          tiebreakScore,
          evidenceRef,
          evidenceMime: opts.evidence.contentType,
          evidenceHash: hash,
          evidenceCapturedAt: meta.capturedAt,
          evidenceFlags: flags,
          recordingRef,
          recordingMime: opts.recording?.contentType ?? null,
        },
      });
      if (claims.value.length > 0) {
        await tx.dailyChallengeRequirementResult.createMany({
          data: claims.value.map((c) => ({ submissionId: created.id, requirementId: c.requirementId, claimedMet: c.claimedMet ?? null, claimedValue: c.claimedValue ?? null })),
        });
      }
      const moved = await tx.dailyChallengeEntry.updateMany({ where: { id: entry.id, status: "ENTERED" }, data: { status: "SUBMITTED" } });
      if (moved.count === 0) throw new ChallengeRefusedError("NOT_ENTERED", "Your entry changed while you were submitting. Reload and check it.");
      return created;
    });
    return { submissionId: submission.id };
  } catch (err) {
    // The unique index on the entry is the real "one score per entry": a double-tap loses here, cleanly.
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") {
      throw new ChallengeRefusedError("ALREADY_SUBMITTED", "You've already submitted a score for this challenge.");
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------------------------------------

export type ReviewInput = {
  submissionId: string;
  reviewerId: string;
  decision: ReviewDecision;
  /** Staff's verdict on each requirement: a tick for a condition, the verified number for a target. */
  verdicts: { requirementId: string; met?: boolean; verifiedValue?: number }[];
  verifiedScore?: number | null;
  verifiedTiebreak?: number | null;
  reasonCode?: string | null;
  note?: string | null;
};

const REVIEWABLE = ["LIVE", "SUBMISSIONS_CLOSED", "UNDER_REVIEW"] as const;

export async function reviewSubmission(input: ReviewInput): Promise<{ status: "VERIFIED" | "REJECTED"; entryStatus: "VERIFIED" | "REJECTED" | "DISQUALIFIED" }> {
  const submission = await prisma.dailyChallengeSubmission.findUnique({
    where: { id: input.submissionId },
    include: {
      entry: { include: { challenge: { include: { requirements: { orderBy: { sortOrder: "asc" } } } } } },
      requirementResults: true,
      disputes: { where: { status: "UPHELD" }, select: { id: true } },
      reviews: { orderBy: { createdAt: "desc" }, take: 1, select: { reviewerId: true } },
    },
  });
  if (!submission) throw new ChallengeRefusedError("NOT_FOUND", "Submission not found.", 404);
  const { entry } = submission;
  const challenge = entry.challenge;

  if (entry.userId === input.reviewerId) throw new ChallengeRefusedError("SELF_REVIEW", "You can't review your own submission. Ask another staff member.", 403);
  if (submission.status !== "PENDING") throw new ChallengeRefusedError("ALREADY_REVIEWED", "This submission has already been reviewed.");
  // After an upheld dispute the decision is made again by someone other than the person who made it the first time.
  if (submission.disputes.length > 0 && submission.reviews[0]?.reviewerId === input.reviewerId) {
    throw new ChallengeRefusedError("SELF_REVIEW", "A dispute on this submission was upheld, so a different reviewer has to decide it again.", 403);
  }
  if (!(REVIEWABLE as readonly string[]).includes(challenge.status)) throw new ChallengeRefusedError("NOT_REVIEWABLE", "Submissions can't be reviewed at this stage of the challenge.");

  // Every requirement needs a verdict from the reviewer. A target's verdict is computed here from the number they
  // read off the evidence — the form's own "met" is never trusted for a target.
  const byId = new Map(input.verdicts.map((v) => [v.requirementId, v]));
  const resolved: { requirementId: string; met: boolean; verifiedValue: number | null }[] = [];
  for (const r of challenge.requirements) {
    const v = byId.get(r.id);
    if (r.kind === "CONDITION") {
      if (typeof v?.met !== "boolean") throw new ChallengeRefusedError("INVALID", `Mark "${r.label}" as met or not met.`, 400);
      resolved.push({ requirementId: r.id, met: v.met, verifiedValue: null });
    } else {
      const value = v?.verifiedValue;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_SCORE) throw new ChallengeRefusedError("INVALID", `Enter the verified number for "${r.label}".`, 400);
      resolved.push({ requirementId: r.id, met: targetMet(r.direction ?? "HIGHER", r.threshold ?? 0, value), verifiedValue: value });
    }
  }
  // Only gate requirements decide whether the entry qualifies at all. The others (a "win the match" that only one prize
  // cares about) still get a verdict, recorded for settlement, but a miss does not stop the score being approved.
  const gates = challenge.requirements.filter((r) => r.gate);
  const { failed, undecided } = evaluateRequirements(gates, resolved.filter((r) => gates.some((g) => g.id === r.requirementId)).map((r) => ({ requirementId: r.requirementId, met: r.met })));
  const belowMinimum = input.decision === "APPROVE" && input.verifiedScore != null && !meetsMinimumScore({ minScore: challenge.minScore, direction: challenge.direction, score: input.verifiedScore });

  const reasonCode = input.reasonCode ?? null;
  const note = input.note?.trim() || null;
  const refusal = reviewRefusal({
    decision: input.decision,
    reasonCode,
    note,
    failed,
    undecided,
    verifiedScore: input.verifiedScore ?? null,
    tiebreakRequired: !!challenge.tiebreakLabel,
    verifiedTiebreak: input.verifiedTiebreak ?? null,
    belowMinimum,
  });
  if (refusal) throw new ChallengeRefusedError("INVALID", refusal, 400);

  const approving = input.decision === "APPROVE";
  const status = approving ? ("VERIFIED" as const) : ("REJECTED" as const);
  const entryStatus = approving ? ("VERIFIED" as const) : input.decision === "DISQUALIFY" ? ("DISQUALIFIED" as const) : ("REJECTED" as const);
  const verifiedScore = approving ? (input.verifiedScore as number) : null;
  const verifiedTiebreak = approving && challenge.tiebreakLabel ? (input.verifiedTiebreak as number) : null;
  // A rejection for a missed requirement always says which one, even if the reviewer left the note empty.
  const finalNote = note ?? (reasonCode === REQUIREMENT_NOT_MET ? `Not met: ${failed.join(", ")}.` : null);
  const decisionLabel = approving ? (verifiedScore === submission.score ? "APPROVE" : "CORRECT") : input.decision;

  await prisma.$transaction(async (tx) => {
    await lockChallenge(tx, challenge.id);
    // Compare-and-swap on PENDING: two reviewers opening the same submission, the second one's save loses.
    const { count } = await tx.dailyChallengeSubmission.updateMany({
      where: { id: submission.id, status: "PENDING" },
      data: { status, verifiedScore, verifiedTiebreakScore: verifiedTiebreak, reviewedById: input.reviewerId, reviewedAt: new Date() },
    });
    if (count === 0) throw new ChallengeRefusedError("ALREADY_REVIEWED", "Someone else reviewed this submission first.");

    for (const r of resolved) {
      await tx.dailyChallengeRequirementResult.updateMany({ where: { submissionId: submission.id, requirementId: r.requirementId }, data: { met: r.met, verifiedValue: r.verifiedValue } });
    }
    await tx.dailyChallengeEntry.update({ where: { id: entry.id }, data: { status: entryStatus } });
    await tx.dailyChallengeReview.create({
      data: { submissionId: submission.id, reviewerId: input.reviewerId, decision: decisionLabel, reasonCode, note: finalNote, scoreBefore: submission.score, scoreAfter: verifiedScore },
    });
  });

  await logAdminAction({
    actorId: input.reviewerId,
    action: "dailyChallenge.review",
    targetType: "DailyChallengeSubmission",
    targetId: submission.id,
    metadata: { challengeId: challenge.id, decision: decisionLabel, reasonCode, scoreBefore: submission.score, scoreAfter: verifiedScore, failedRequirements: failed },
  });

  // Tell the player, outside the transaction: a failed notification must never undo a decision.
  if (approving) {
    await notify(entry.userId, "DAILY_CHALLENGE_SCORE_VERIFIED", { challengeId: challenge.id, title: challenge.title, score: verifiedScore }).catch(() => {});
  } else {
    const label = isReviewReasonCode(reasonCode) ? REVIEW_REASON_LABEL[reasonCode] : null;
    await notify(entry.userId, "DAILY_CHALLENGE_SCORE_REJECTED", { challengeId: challenge.id, title: challenge.title, reason: [label, finalNote].filter(Boolean).join(" — ") }).catch(() => {});
  }
  return { status, entryStatus };
}

/** How many submissions are waiting for a reviewer, and how many other submissions carry the same file. For the queue. */
export async function reviewQueueCounts(challengeId: string): Promise<{ pending: number }> {
  return { pending: await prisma.dailyChallengeSubmission.count({ where: { status: "PENDING", entry: { challengeId } } }) };
}
