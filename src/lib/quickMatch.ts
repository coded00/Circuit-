/**
 * Circuit — Quick Match shared logic (creation validation constants,
 * eligibility, and the accept-time atomic "first wins" flow). Centralized
 * here the same way `src/lib/matches.ts` centralizes match logic, rather
 * than duplicated across the create/accept/cancel routes.
 */

import { prisma } from "@/lib/db";
import type { Prisma, QuickMatchChallenge, User } from "@prisma/client";

export const VALID_FORMATS = ["SINGLE", "BEST_OF_3"];

// Mirrors MAX_STAKE_AMOUNT in src/app/api/battles/route.ts — same
// duplicate-with-comment convention already used for this constant
// (see BattleForm.tsx's own copy) rather than a shared constants module.
export const MAX_STAKE_AMOUNT = 10_000_000; // ₦100,000

// "Online" for eligibility means a heartbeat within this window — see
// User.lastActiveAt's own schema comment. A little slack over the ~25s
// heartbeat interval for normal network/tab-timer jitter.
export const PRESENCE_WINDOW_MS = 60_000;

// The spec's own example default — configurable per-request up to a
// sane ceiling, not yet a PlatformSetting (no product need to tune this
// platform-wide has come up yet; easy to promote later if it does).
export const DEFAULT_TIMEOUT_MS = 60_000;
export const MIN_TIMEOUT_MS = 15_000;
export const MAX_TIMEOUT_MS = 5 * 60_000;

// Bounds worst-case fan-out (and the notification volume it generates) —
// an early-stage platform has no need to blast hundreds of players from
// one challenge, and this keeps the eligibility query's exclusion-list
// building cheap.
export const MAX_RECIPIENTS = 30;

export class InsufficientWalletBalanceError extends Error {}
export class ChallengeNotFoundError extends Error {}
export class NotAPendingRecipientError extends Error {}
export class ChallengeContendedError extends Error {}
export class ChallengeUnavailableError extends Error {}

type EligibleUser = Pick<User, "id" | "displayName" | "handle" | "avatarUrl" | "walletBalance">;

/**
 * Non-suspended, online (recent heartbeat), can afford the stake, and not
 * already busy in an active Battle/Match — the same "exclude self +
 * suspended" shape Discovery's own candidate-pool query already uses,
 * extended with the busy-exclusion Quick Match specifically needs. No
 * blocking exclusion: this codebase has no Block/BlockedUser concept
 * anywhere (only Friendship, which has no negative/blocked state), so
 * that part of a "who can challenge whom" rule set isn't implementable
 * yet — a real gap, not silently dropped.
 */
export async function getEligibleRecipients(
  hostId: string,
  params: { stakeAmount: number }
): Promise<EligibleUser[]> {
  const cutoff = new Date(Date.now() - PRESENCE_WINDOW_MS);

  const [busyInBattles, busyInMatches] = await Promise.all([
    prisma.battle.findMany({
      where: { status: { in: ["OPEN", "ACCEPTED"] } },
      select: { creatorId: true, targetUserId: true },
    }),
    prisma.match.findMany({
      where: { status: { in: ["UPCOMING", "NEEDS_RESULT", "DISPUTED"] } },
      select: { playerAId: true, playerBId: true },
    }),
  ]);
  const busyIds = new Set<string>();
  for (const b of busyInBattles) {
    busyIds.add(b.creatorId);
    if (b.targetUserId) busyIds.add(b.targetUserId);
  }
  for (const m of busyInMatches) {
    busyIds.add(m.playerAId);
    busyIds.add(m.playerBId);
  }
  busyIds.add(hostId);

  return prisma.user.findMany({
    where: {
      id: { notIn: Array.from(busyIds) },
      isSuspended: false,
      lastActiveAt: { gte: cutoff },
      walletBalance: { gte: params.stakeAmount },
    },
    select: { id: true, displayName: true, handle: true, avatarUrl: true, walletBalance: true },
    take: MAX_RECIPIENTS,
    orderBy: { lastActiveAt: "desc" },
  });
}

/**
 * The accept-time consequence transaction (called only after the caller
 * has already won the challenge's own PENDING→ACCEPTED compare-and-swap
 * standalone update — see the accept route). Debits the accepter,
 * creates the Battle, backfills/creates the STAKE escrow rows, and
 * invalidates every other still-pending recipient — all inside one
 * transaction, so a downstream failure (most likely insufficient balance)
 * can't leave any of this half-done. Match creation happens *after* this
 * transaction commits (see the accept route), matching how the existing
 * Battle-accept route also keeps Match creation outside its own
 * transaction and reuses its own collision-retry logic instead of
 * duplicating it here.
 */
export async function resolveQuickMatchAcceptance(
  challenge: QuickMatchChallenge,
  accepterId: string
): Promise<{ battleId: string }> {
  return prisma.$transaction(async (tx) => {
    if (challenge.stakeAmount > 0) {
      const debited = await tx.user.updateMany({
        where: { id: accepterId, walletBalance: { gte: challenge.stakeAmount } },
        data: { walletBalance: { decrement: challenge.stakeAmount } },
      });
      if (debited.count === 0) throw new InsufficientWalletBalanceError();
    }

    const battle = await tx.battle.create({
      data: {
        creatorId: challenge.hostId,
        game: challenge.game,
        format: challenge.format,
        visibility: "TARGETED",
        targetUserId: accepterId,
        stakeAmount: challenge.stakeAmount,
        status: "ACCEPTED",
      },
    });

    if (challenge.stakeAmount > 0) {
      // The host's stake was locked at challenge-creation time as a
      // quickMatchChallengeId-only row (no Battle existed yet) — backfill
      // battleId onto that same row now rather than creating a second
      // one, so the wallet-history view (src/lib/wallet.ts) shows one
      // continuous line item, not a duplicate.
      await tx.escrowTransaction.updateMany({
        where: { quickMatchChallengeId: challenge.id, userId: challenge.hostId, type: "STAKE" },
        data: { battleId: battle.id },
      });
      await tx.escrowTransaction.create({
        data: {
          battleId: battle.id,
          quickMatchChallengeId: challenge.id,
          userId: accepterId,
          type: "STAKE",
          amount: challenge.stakeAmount,
          status: "COMPLETE",
        },
      });
      await tx.walletTransaction.create({
        data: { userId: accepterId, type: "STAKE_DEBIT", amount: challenge.stakeAmount, status: "COMPLETE" },
      });
    }

    await tx.quickMatchChallenge.update({
      where: { id: challenge.id },
      data: { battleId: battle.id },
    });
    await tx.quickMatchRecipient.updateMany({
      where: { challengeId: challenge.id, recipientUserId: accepterId },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
    await tx.quickMatchRecipient.updateMany({
      where: { challengeId: challenge.id, recipientUserId: { not: accepterId }, status: "PENDING" },
      data: { status: "CANCELLED", respondedAt: new Date() },
    });

    return { battleId: battle.id };
  });
}

/**
 * Refunds the host's locked stake (if any) and cancels every pending
 * recipient — used by both cancellation and lazy expiry, which share the
 * exact same money-safety requirement: the status flip and the refund
 * must happen in one transaction, not two. This codebase already found
 * and fixed the two-transaction version of this bug once, for Battle
 * cancellation (`src/app/api/battles/[id]/cancel/route.ts`) — "a
 * crash/error between them could leave the Battle CANCELLED with the
 * creator's stake still locked and never credited back."
 */
async function closeChallengeAndRefund(
  tx: Prisma.TransactionClient,
  challenge: { id: string; hostId: string; stakeAmount: number },
  finalStatus: "CANCELLED" | "EXPIRED"
): Promise<void> {
  await tx.quickMatchRecipient.updateMany({
    where: { challengeId: challenge.id, status: "PENDING" },
    data: { status: finalStatus, respondedAt: new Date() },
  });

  if (challenge.stakeAmount > 0) {
    await tx.user.update({
      where: { id: challenge.hostId },
      data: { walletBalance: { increment: challenge.stakeAmount } },
    });
    await tx.escrowTransaction.create({
      data: {
        quickMatchChallengeId: challenge.id,
        userId: challenge.hostId,
        type: "REFUND",
        amount: challenge.stakeAmount,
        status: "COMPLETE",
      },
    });
    await tx.walletTransaction.create({
      data: { userId: challenge.hostId, type: "STAKE_CREDIT", amount: challenge.stakeAmount, status: "COMPLETE" },
    });
  }
}

/** Host-initiated cancellation — PENDING-only CAS + refund, one transaction. */
export async function cancelQuickMatchChallenge(challengeId: string, hostId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.quickMatchChallenge.updateMany({
      where: { id: challengeId, hostId, status: "PENDING" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (claimed.count === 0) throw new ChallengeUnavailableError();

    const challenge = await tx.quickMatchChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    await closeChallengeAndRefund(tx, challenge, "CANCELLED");
  });
}

/**
 * Lazily flips a PENDING-but-past-`expiresAt` challenge to EXPIRED and
 * refunds it — called from any read that happens to touch it (primarily
 * the host's own status poll), not dependent on a cron sweep having run.
 * A no-op (returns false) if the challenge isn't actually expired yet, or
 * was already resolved by something else in the meantime — this is
 * itself a CAS, so concurrent callers can't double-refund.
 */
export async function expireQuickMatchChallengeIfDue(challengeId: string): Promise<boolean> {
  let expired = false;
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.quickMatchChallenge.updateMany({
      where: { id: challengeId, status: "PENDING", expiresAt: { lt: new Date() } },
      data: { status: "EXPIRED" },
    });
    if (claimed.count === 0) return;

    const challenge = await tx.quickMatchChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    await closeChallengeAndRefund(tx, challenge, "EXPIRED");
    expired = true;
  });
  return expired;
}

/**
 * Recovery for a failed accept attempt (see the accept route's catch
 * block): the standalone CAS there already flipped the challenge to
 * ACCEPTED before the consequence transaction failed, so this reopens it
 * for other pending recipients to race for — or, if `expiresAt` has since
 * passed, closes it out with the same refund-in-one-transaction shape as
 * `expireQuickMatchChallengeIfDue`/`cancelQuickMatchChallenge`, since a
 * host's stake must never be left orphaned on a terminal challenge.
 */
export async function recoverFailedAccept(challengeId: string, wasStillOpen: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (wasStillOpen) {
      await tx.quickMatchChallenge.updateMany({
        where: { id: challengeId, status: "ACCEPTED" },
        data: { status: "PENDING", acceptedByUserId: null, acceptedAt: null },
      });
      return;
    }

    const claimed = await tx.quickMatchChallenge.updateMany({
      where: { id: challengeId, status: "ACCEPTED" },
      data: { status: "EXPIRED", acceptedByUserId: null, acceptedAt: null },
    });
    if (claimed.count === 0) return;

    const challenge = await tx.quickMatchChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    await closeChallengeAndRefund(tx, challenge, "EXPIRED");
  });
}
