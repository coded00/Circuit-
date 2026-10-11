/**
 * Circuit — Daily Challenge entries and the money that moves with them: enter, withdraw, refund, and the sweep
 * that advances a challenge through its clock (docs/daily-challenges-spec.md §5).
 *
 * Everything money-shaped is one transaction per entry, written in the order the rest of the ledger is:
 *
 *   entry row → conditional wallet debit → CHALLENGE_ENTRY (full fee) + CHALLENGE_PLATFORM_FEE (Circuit's cut)
 *             + CHALLENGE_ENTRY_DEBIT on the wallet.
 *
 * A refund is the same rows reversed as NEW rows (CHALLENGE_REFUND, CHALLENGE_PLATFORM_FEE_REVERSAL,
 * CHALLENGE_ENTRY_REFUND) — the ledger is append-only, so nothing is ever edited back.
 *
 * Locks are always taken in the same order, challenge row first, then the player's row, so two requests that
 * touch the same pair can only queue behind each other, never deadlock. The challenge lock is what makes "the
 * last place" a place only one of two simultaneous requests can take; the player lock is what makes the account's
 * spending limits a limit a double-click cannot defeat (same reasoning as `lockStake`).
 *
 * The rules themselves (is entry open, is it full, may this entry be withdrawn) are in dailyChallenges.ts and are
 * evaluated here against rows read UNDER the lock, not against what the page showed a moment ago.
 */

import { randomBytes } from "crypto";
import type { DailyChallengeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertAgeGate } from "@/lib/age-gate";
import { isSelfExcluded, selfExclusionMessage } from "@/lib/selfExclusion";
import { assertWithinStakeBudget, InsufficientWalletBalanceError, StakeLimitError } from "@/lib/stakes";
import { computePlatformFee } from "@/lib/platformFee";
import { notify } from "@/lib/notifications";
import { captureException } from "@/lib/observability";
import { entryRefusal, nextTimedMove, refundableOnCancel, withdrawRefusal, type GateCode } from "@/lib/dailyChallenges";
import { loadChallengeSettings } from "@/lib/dailyChallengeSettings";

/** A "no" that is the player's answer, not a failure: surface `message` as a 4xx. */
export class ChallengeRefusedError extends Error {
  readonly code: GateCode | "NOT_FOUND" | "NO_IN_GAME_NAME" | "SUSPENDED" | "INSUFFICIENT_BALANCE" | "AGE" | "LIMIT" | "INVALID" | "NOT_REVIEWABLE" | "SELF_REVIEW" | "ALREADY_REVIEWED";
  readonly status: number;

  constructor(code: ChallengeRefusedError["code"], message: string, status = 409) {
    super(message);
    this.name = "ChallengeRefusedError";
    this.code = code;
    this.status = status;
  }
}

/** No 0/O, 1/I/L: a code read off a screen recording shouldn't be ambiguous. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A short code shown only to one entrant. A recording has to begin by showing it, so old or borrowed footage can't be reused. */
export function newVerificationCode(): string {
  return [...randomBytes(6)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

async function lockChallenge(tx: Prisma.TransactionClient, challengeId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "DailyChallenge" WHERE id = ${challengeId} FOR UPDATE`;
}

async function lockPlayer(tx: Prisma.TransactionClient, userId: string): Promise<Date | null> {
  const [row] = await tx.$queryRaw<{ selfExcludedUntil: Date | null }[]>`SELECT "selfExcludedUntil" FROM "User" WHERE id = ${userId} FOR UPDATE`;
  return row?.selfExcludedUntil ?? null;
}

const ACTIVE_ENTRY = { notIn: ["WITHDRAWN", "REFUNDED"] as ("WITHDRAWN" | "REFUNDED")[] };

// ---------------------------------------------------------------------------------------------------------
// Enter
// ---------------------------------------------------------------------------------------------------------

export async function enterChallenge(opts: { userId: string; challengeId: string; now?: Date }): Promise<{ entryId: string }> {
  const now = opts.now ?? new Date();

  const [user, challenge, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: opts.userId }, select: { isSuspended: true, suspensionReason: true, dateOfBirth: true } }),
    prisma.dailyChallenge.findUnique({ where: { id: opts.challengeId }, select: { gameId: true, gameName: true, entryFee: true } }),
    loadChallengeSettings(),
  ]);
  if (!user) throw new ChallengeRefusedError("NOT_FOUND", "You need to be signed in.", 401);
  if (!challenge) throw new ChallengeRefusedError("NOT_FOUND", "Challenge not found.", 404);
  if (user.isSuspended) throw new ChallengeRefusedError("SUSPENDED", `Your account is suspended: ${user.suspensionReason ?? "contact support."}`, 403);

  // Money rules apply to money challenges only; browsing and free entry are never age-gated (as for tournaments).
  if (challenge.entryFee > 0) {
    try {
      assertAgeGate(user.dateOfBirth);
    } catch (err) {
      throw new ChallengeRefusedError("AGE", err instanceof Error ? err.message : "You have to be 18 or older to enter a paid challenge.", 403);
    }
  }

  const name = await prisma.userGameName.findUnique({ where: { userId_gameId: { userId: opts.userId, gameId: challenge.gameId } }, select: { name: true } });
  if (!name?.name.trim()) {
    throw new ChallengeRefusedError("NO_IN_GAME_NAME", `Add your ${challenge.gameName} in-game name to your profile first. Reviewers match your evidence to it.`);
  }

  return prisma.$transaction(async (tx) => {
    await lockChallenge(tx, opts.challengeId);
    const c = await tx.dailyChallenge.findUnique({ where: { id: opts.challengeId } });
    if (!c) throw new ChallengeRefusedError("NOT_FOUND", "Challenge not found.", 404);
    const excludedUntil = c.entryFee > 0 ? await lockPlayer(tx, opts.userId) : null;

    const [existing, activeEntryCount] = await Promise.all([
      tx.dailyChallengeEntry.findUnique({ where: { challengeId_userId: { challengeId: c.id, userId: opts.userId } } }),
      tx.dailyChallengeEntry.count({ where: { challengeId: c.id, status: ACTIVE_ENTRY } }),
    ]);

    const refusal = entryRefusal({
      challenge: c,
      activeEntryCount,
      alreadyEntered: !!existing && existing.status !== "WITHDRAWN",
      enabled: settings.enabled,
      maxEntryFeeKobo: settings.maxEntryFeeKobo,
      now,
    });
    if (refusal) throw new ChallengeRefusedError(refusal.code, refusal.message);

    if (c.entryFee > 0) {
      if (isSelfExcluded(excludedUntil, now.getTime())) throw new StakeLimitError("SELF_EXCLUDED", selfExclusionMessage(excludedUntil));
      const setting = await tx.platformSetting.findUnique({ where: { id: "singleton" } });
      await assertWithinStakeBudget(tx, { userId: opts.userId, amount: c.entryFee, now: now.getTime(), setting });
    }

    // The entry first: the ledger rows point at it.
    const entry = existing
      ? await tx.dailyChallengeEntry.update({ where: { id: existing.id }, data: { status: "ENTERED", inGameName: name.name.trim(), verificationCode: newVerificationCode() } })
      : await tx.dailyChallengeEntry.create({ data: { challengeId: c.id, userId: opts.userId, inGameName: name.name.trim(), verificationCode: newVerificationCode() } });

    if (c.entryFee > 0) {
      // Conditional debit: refused, not negative, if the balance can't cover it.
      const debited = await tx.user.updateMany({ where: { id: opts.userId, walletBalance: { gte: c.entryFee } }, data: { walletBalance: { decrement: c.entryFee } } });
      if (debited.count === 0) throw new InsufficientWalletBalanceError();

      const cut = computePlatformFee(c.entryFee, c.platformFeeBps);
      await tx.escrowTransaction.create({
        data: { dailyChallengeId: c.id, dailyChallengeEntryId: entry.id, userId: opts.userId, type: "CHALLENGE_ENTRY", amount: c.entryFee, status: "COMPLETE" },
      });
      if (cut > 0) {
        await tx.escrowTransaction.create({
          data: { dailyChallengeId: c.id, dailyChallengeEntryId: entry.id, type: "CHALLENGE_PLATFORM_FEE", amount: cut, status: "COMPLETE" },
        });
      }
      await tx.walletTransaction.create({ data: { userId: opts.userId, type: "CHALLENGE_ENTRY_DEBIT", amount: c.entryFee, status: "COMPLETE" } });
    }
    return { entryId: entry.id };
  });
}

// ---------------------------------------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------------------------------------

/**
 * Puts one entry's money back and moves the entry to `to`, inside the caller's transaction. A compare-and-swap on
 * the entry's status makes it safe to call twice: the second call finds nothing to move and writes nothing.
 * Returns the kobo refunded (0 for a free challenge or an entry that was already settled), or null if there was
 * nothing to do.
 */
async function refundEntry(
  tx: Prisma.TransactionClient,
  entry: { id: string; userId: string; challengeId: string },
  challenge: { entryFee: number; platformFeeBps: number },
  to: "WITHDRAWN" | "REFUNDED",
): Promise<number | null> {
  const moved = await tx.dailyChallengeEntry.updateMany({ where: { id: entry.id, status: ACTIVE_ENTRY }, data: { status: to } });
  if (moved.count === 0) return null;
  if (challenge.entryFee <= 0) return 0;

  await tx.user.update({ where: { id: entry.userId }, data: { walletBalance: { increment: challenge.entryFee } } });
  await tx.escrowTransaction.create({
    data: { dailyChallengeId: entry.challengeId, dailyChallengeEntryId: entry.id, userId: entry.userId, type: "CHALLENGE_REFUND", amount: challenge.entryFee, status: "COMPLETE" },
  });
  const cut = computePlatformFee(challenge.entryFee, challenge.platformFeeBps);
  if (cut > 0) {
    await tx.escrowTransaction.create({
      data: { dailyChallengeId: entry.challengeId, dailyChallengeEntryId: entry.id, type: "CHALLENGE_PLATFORM_FEE_REVERSAL", amount: cut, status: "COMPLETE" },
    });
  }
  await tx.walletTransaction.create({ data: { userId: entry.userId, type: "CHALLENGE_ENTRY_REFUND", amount: challenge.entryFee, status: "COMPLETE" } });
  return challenge.entryFee;
}

/** A player leaves before the match window starts and gets their fee back. */
export async function withdrawEntry(opts: { userId: string; challengeId: string; now?: Date }): Promise<{ refunded: number }> {
  const now = opts.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    await lockChallenge(tx, opts.challengeId);
    const c = await tx.dailyChallenge.findUnique({ where: { id: opts.challengeId } });
    if (!c) throw new ChallengeRefusedError("NOT_FOUND", "Challenge not found.", 404);
    await lockPlayer(tx, opts.userId);
    const entry = await tx.dailyChallengeEntry.findUnique({ where: { challengeId_userId: { challengeId: c.id, userId: opts.userId } } });
    if (!entry) throw new ChallengeRefusedError("NOT_ENTERED", "You're not in this challenge.");

    const refusal = withdrawRefusal({ challenge: c, entryStatus: entry.status, now });
    if (refusal) throw new ChallengeRefusedError(refusal.code, refusal.message);

    const refunded = await refundEntry(tx, entry, c, "WITHDRAWN");
    if (refunded === null) throw new ChallengeRefusedError("NOT_ENTERED", "This entry can't be withdrawn.");
    return { refunded };
  });
}

/**
 * Refunds every entry in a cancelled challenge, one transaction per entry. Per entry rather than all at once
 * because a full challenge is dozens of entries, each several writes to a database that may be a network
 * round-trip away; one entry failing must not roll back the others' refunds. Safe to call again: an entry already
 * refunded is skipped, which is also how `refundCancelledChallenges` finishes a cancel that was interrupted.
 */
export async function refundAllEntries(challengeId: string, context: { title: string; reason: string | null }): Promise<{ refunded: number; failed: number }> {
  const challenge = await prisma.dailyChallenge.findUnique({ where: { id: challengeId }, select: { entryFee: true, platformFeeBps: true } });
  if (!challenge) return { refunded: 0, failed: 0 };
  const entries = await prisma.dailyChallengeEntry.findMany({ where: { challengeId, status: ACTIVE_ENTRY }, select: { id: true, userId: true, challengeId: true, status: true } });

  let refunded = 0;
  let failed = 0;
  for (const entry of entries) {
    if (!refundableOnCancel(entry.status)) continue;
    try {
      const amount = await prisma.$transaction(async (tx) => {
        await lockPlayer(tx, entry.userId);
        return refundEntry(tx, entry, challenge, "REFUNDED");
      });
      if (amount === null) continue;
      refunded++;
      await notify(entry.userId, "DAILY_CHALLENGE_CANCELLED", { challengeId, title: context.title, reason: context.reason, refunded: amount }).catch(() => {});
    } catch (err) {
      failed++;
      captureException(err, { source: "dailyChallenge:refundEntry", challengeId, entryId: entry.id });
    }
  }
  return { refunded, failed };
}

/**
 * The no-winner refund: when nobody qualified and the challenge's policy is to give the money back, every entry gets its
 * fee back except those disqualified (a disqualification keeps the fee). One transaction per entry, like a cancel, and safe
 * to run again — an entry already refunded is skipped.
 */
export async function refundNoWinnerEntries(challengeId: string): Promise<{ refunded: number; failed: number }> {
  const challenge = await prisma.dailyChallenge.findUnique({ where: { id: challengeId }, select: { entryFee: true, platformFeeBps: true } });
  if (!challenge) return { refunded: 0, failed: 0 };
  const entries = await prisma.dailyChallengeEntry.findMany({ where: { challengeId, status: { notIn: ["WITHDRAWN", "REFUNDED", "DISQUALIFIED"] } }, select: { id: true, userId: true, challengeId: true } });
  let refunded = 0;
  let failed = 0;
  for (const entry of entries) {
    try {
      const amount = await prisma.$transaction(async (tx) => {
        await lockPlayer(tx, entry.userId);
        return refundEntry(tx, entry, challenge, "REFUNDED");
      });
      if (amount !== null) refunded++;
    } catch (err) {
      failed++;
      captureException(err, { source: "dailyChallenge:refundNoWinner", challengeId, entryId: entry.id });
    }
  }
  return { refunded, failed };
}

// ---------------------------------------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------------------------------------

/**
 * The moves the sweep makes on its own: opening, going live, closing submissions, handing to review, publishing provisional
 * results once every submission is decided, finalizing when the dispute window has passed with nothing open, and
 * cancelling an under-filled challenge. Money moves are not on the clock: settlement (src/lib/challengeSettlement.ts) runs
 * after, and waits for a named approval where one is needed.
 */
const SWEEP_MOVES: ReadonlySet<DailyChallengeStatus> = new Set(["OPEN", "LIVE", "SUBMISSIONS_CLOSED", "UNDER_REVIEW", "PROVISIONAL", "FINALIZED", "CANCELLED"]);
const MAX_STEPS = 6;

export async function advanceDailyChallenges(
  now: Date = new Date(),
  /** Limit the run to these challenges. Tests that pass a made-up clock use it so they cannot move anyone else's challenge. */
  opts: { only?: string[] } = {},
): Promise<{ moved: number; cancelled: number; refunded: number; errors: string[] }> {
  const out = { moved: 0, cancelled: 0, refunded: 0, errors: [] as string[] };
  const candidates = await prisma.dailyChallenge.findMany({
    where: { status: { in: ["SCHEDULED", "OPEN", "LIVE", "SUBMISSIONS_CLOSED", "UNDER_REVIEW", "PROVISIONAL"] }, pausedAt: null, ...(opts.only ? { id: { in: opts.only } } : {}) },
    select: { id: true },
    take: 100,
  });

  for (const { id } of candidates) {
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const c = await prisma.dailyChallenge.findUnique({ where: { id } });
        if (!c || c.pausedAt) break;
        const [activeEntryCount, pendingSubmissions, openDisputes] = await Promise.all([
          prisma.dailyChallengeEntry.count({ where: { challengeId: id, status: ACTIVE_ENTRY } }),
          prisma.dailyChallengeSubmission.count({ where: { status: "PENDING", entry: { challengeId: id } } }),
          prisma.dailyChallengeDispute.count({ where: { status: "OPEN", submission: { entry: { challengeId: id } } } }),
        ]);
        const move = nextTimedMove(c, { activeEntryCount, pendingSubmissions, openDisputes }, now);
        if (!move || !SWEEP_MOVES.has(move.to)) break;

        // Compare-and-swap on the status we read: a second sweep, or staff cancelling at this moment, wins or loses cleanly.
        const cancelling = move.to === "CANCELLED";
        const { count } = await prisma.dailyChallenge.updateMany({
          where: { id, status: c.status, pausedAt: null },
          data: cancelling
            ? { status: "CANCELLED", cancelledAt: now, cancelledReason: move.reason }
            : move.to === "PROVISIONAL"
              ? { status: move.to, provisionalAt: now }
              : move.to === "FINALIZED"
                ? { status: move.to, finalizedAt: now }
                : { status: move.to },
        });
        if (count === 0) break;
        out.moved++;

        if (cancelling) {
          out.cancelled++;
          const r = await refundAllEntries(id, { title: c.title, reason: move.reason ?? null });
          out.refunded += r.refunded;
          if (r.failed > 0) out.errors.push(`dailyChallenge:${id}:refunds`);
          break;
        }
        if (move.to === "PROVISIONAL") {
          const people = await prisma.dailyChallengeEntry.findMany({ where: { challengeId: id, status: { in: ["VERIFIED", "REJECTED", "DISQUALIFIED"] } }, select: { userId: true } });
          await Promise.all(people.map((e) => notify(e.userId, "DAILY_CHALLENGE_RESULT", { challengeId: id, title: c.title, note: `provisional results are in. You have ${c.disputeWindowMinutes} minutes to dispute a decision` }).catch(() => {})));
        }
        if (move.to === "LIVE") {
          const entrants = await prisma.dailyChallengeEntry.findMany({ where: { challengeId: id, status: "ENTERED" }, select: { userId: true } });
          await Promise.all(entrants.map((e) => notify(e.userId, "DAILY_CHALLENGE_LIVE", { challengeId: id, title: c.title }).catch(() => {})));
        }
      }
    } catch (err) {
      captureException(err, { source: "sweep:dailyChallenges", challengeId: id });
      out.errors.push(`dailyChallenge:${id}`);
    }
  }

  // Finish any cancel that was interrupted between marking the challenge cancelled and paying everyone back.
  const stuck = await prisma.dailyChallenge.findMany({
    where: { status: "CANCELLED", entries: { some: { status: ACTIVE_ENTRY } }, ...(opts.only ? { id: { in: opts.only } } : {}) },
    select: { id: true, title: true, cancelledReason: true },
    take: 20,
  });
  for (const c of stuck) {
    try {
      const r = await refundAllEntries(c.id, { title: c.title, reason: c.cancelledReason });
      out.refunded += r.refunded;
      if (r.failed > 0) out.errors.push(`dailyChallenge:${c.id}:refunds`);
    } catch (err) {
      captureException(err, { source: "sweep:dailyChallengeRefunds", challengeId: c.id });
      out.errors.push(`dailyChallenge:${c.id}:refunds`);
    }
  }
  return out;
}
