import { describe, it, expect, afterEach } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createTestUser, cleanupAll } from "@/testHelpers";
import {
  InsufficientWalletBalanceError,
  cancelQuickMatchChallenge,
  ChallengeUnavailableError,
  expireQuickMatchChallengeIfDue,
  getEligibleRecipients,
  recoverFailedAccept,
  resolveQuickMatchAcceptance,
  sweepQuickMatchChallenges,
} from "./quickMatch";

/**
 * Regression coverage for Quick Match's "first accept wins" design (see
 * the plan's stress-test pass): the standalone status CAS an accept route
 * uses to claim a challenge before resolveQuickMatchAcceptance() runs its
 * consequence transaction, and the shared refund-in-one-transaction shape
 * cancelQuickMatchChallenge/expireQuickMatchChallengeIfDue both use — the
 * exact bug class this codebase already found and fixed once for Battle
 * cancellation (a crash between the status flip and the refund
 * permanently stranding a locked stake).
 */

afterEach(async () => {
  await cleanupAll();
});

async function createChallenge(hostId: string, overrides: Partial<Prisma.QuickMatchChallengeUncheckedCreateInput> = {}) {
  return prisma.quickMatchChallenge.create({
    data: {
      hostId,
      game: "Test Game",
      format: "SINGLE",
      stakeAmount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    },
  });
}

describe("the challenge-claim compare-and-swap: only one of many concurrent accepts wins", () => {
  it("the underlying CAS lets exactly one of several concurrent attempts win", async () => {
    const host = await createTestUser();
    const challenge = await createChallenge(host.id);
    const attemptUsers = await Promise.all(Array.from({ length: 6 }, () => createTestUser()));

    const attempts = await Promise.all(
      attemptUsers.map((u) =>
        prisma.quickMatchChallenge.updateMany({
          where: { id: challenge.id, status: "PENDING", expiresAt: { gt: new Date() } },
          data: { status: "ACCEPTED", acceptedByUserId: u.id, acceptedAt: new Date() },
        })
      )
    );
    expect(attempts.filter((a) => a.count === 1)).toHaveLength(1);
  });

  it("resolveQuickMatchAcceptance pays out exactly once for a staked challenge across concurrent full accept attempts", async () => {
    const host = await createTestUser({ walletBalance: 1_000_000 });
    const stakeAmount = 40_000;
    const recipients = await Promise.all([
      createTestUser({ walletBalance: 1_000_000 }),
      createTestUser({ walletBalance: 1_000_000 }),
      createTestUser({ walletBalance: 1_000_000 }),
    ]);
    const challenge = await prisma.quickMatchChallenge.create({
      data: {
        hostId: host.id,
        game: "Test Game",
        format: "SINGLE",
        stakeAmount,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.quickMatchRecipient.createMany({
      data: recipients.map((r) => ({ challengeId: challenge.id, recipientUserId: r.id })),
    });
    // Mirrors the real creation flow: the host's stake is locked up front.
    await prisma.user.update({ where: { id: host.id }, data: { walletBalance: { decrement: stakeAmount } } });
    await prisma.escrowTransaction.create({
      data: { quickMatchChallengeId: challenge.id, userId: host.id, type: "STAKE", amount: stakeAmount, status: "COMPLETE" },
    });

    async function attemptAccept(recipientId: string) {
      const claimed = await prisma.quickMatchChallenge.updateMany({
        where: { id: challenge.id, status: "PENDING", expiresAt: { gt: new Date() } },
        data: { status: "ACCEPTED", acceptedByUserId: recipientId, acceptedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error("LOST_CAS");
      return resolveQuickMatchAcceptance(challenge, recipientId);
    }

    const results = await Promise.allSettled(recipients.map((r) => attemptAccept(r.id)));
    const succeeded = results.filter((r) => r.status === "fulfilled");
    expect(succeeded).toHaveLength(1);

    const finalChallenge = await prisma.quickMatchChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
    expect(finalChallenge.status).toBe("ACCEPTED");
    expect(finalChallenge.battleId).not.toBeNull();

    const recipientRows = await prisma.quickMatchRecipient.findMany({ where: { challengeId: challenge.id } });
    expect(recipientRows.filter((r) => r.status === "ACCEPTED")).toHaveLength(1);
    expect(recipientRows.filter((r) => r.status === "CANCELLED")).toHaveLength(2);

    // Money invariant: exactly one accepter debited, host's stake
    // resolved into the Battle (not refunded, not double-charged).
    const winnerRow = recipientRows.find((r) => r.status === "ACCEPTED")!;
    const winner = await prisma.user.findUniqueOrThrow({ where: { id: winnerRow.recipientUserId } });
    expect(winner.walletBalance).toBe(1_000_000 - stakeAmount);
    const untouched = recipientRows.filter((r) => r.status === "CANCELLED").map((r) => r.recipientUserId);
    for (const id of untouched) {
      const u = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect(u.walletBalance).toBe(1_000_000);
    }

    const stakeRows = await prisma.escrowTransaction.findMany({
      where: { quickMatchChallengeId: challenge.id, type: "STAKE" },
    });
    expect(stakeRows).toHaveLength(2); // host's backfilled row + the winner's fresh row
    expect(stakeRows.every((r) => r.battleId === finalChallenge.battleId)).toBe(true);
  });
});

describe("expiry prevents late acceptance without depending on a sweep", () => {
  it("an accept attempt after expiresAt fails the CAS", async () => {
    const host = await createTestUser();
    const challenge = await createChallenge(host.id, { expiresAt: new Date(Date.now() - 1000) });

    const claimed = await prisma.quickMatchChallenge.updateMany({
      where: { id: challenge.id, status: "PENDING", expiresAt: { gt: new Date() } },
      data: { status: "ACCEPTED", acceptedByUserId: "someone", acceptedAt: new Date() },
    });
    expect(claimed.count).toBe(0);
  });

  it("expireQuickMatchChallengeIfDue refunds the host's stake and cancels pending recipients, and is idempotent", async () => {
    const host = await createTestUser({ walletBalance: 500_000 });
    const stakeAmount = 20_000;
    const recipient = await createTestUser();
    const challenge = await prisma.quickMatchChallenge.create({
      data: {
        hostId: host.id,
        game: "Test Game",
        format: "SINGLE",
        stakeAmount,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await prisma.quickMatchRecipient.create({ data: { challengeId: challenge.id, recipientUserId: recipient.id } });
    await prisma.user.update({ where: { id: host.id }, data: { walletBalance: { decrement: stakeAmount } } });
    await prisma.escrowTransaction.create({
      data: { quickMatchChallengeId: challenge.id, userId: host.id, type: "STAKE", amount: stakeAmount, status: "COMPLETE" },
    });

    const first = await expireQuickMatchChallengeIfDue(challenge.id);
    expect(first).toBe(true);

    const expiredChallenge = await prisma.quickMatchChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
    expect(expiredChallenge.status).toBe("EXPIRED");
    const recipientRow = await prisma.quickMatchRecipient.findFirstOrThrow({ where: { challengeId: challenge.id } });
    expect(recipientRow.status).toBe("EXPIRED");
    const refundedHost = await prisma.user.findUniqueOrThrow({ where: { id: host.id } });
    expect(refundedHost.walletBalance).toBe(500_000); // fully refunded, not partially

    // Concurrent/repeat calls must not double-refund.
    const second = await expireQuickMatchChallengeIfDue(challenge.id);
    expect(second).toBe(false);
    const afterSecondCall = await prisma.user.findUniqueOrThrow({ where: { id: host.id } });
    expect(afterSecondCall.walletBalance).toBe(500_000);
  });
});

describe("cancellation refunds the host in the same transaction as the status flip", () => {
  it("cancelQuickMatchChallenge refunds the host and cancels pending recipients", async () => {
    const host = await createTestUser({ walletBalance: 300_000 });
    const stakeAmount = 15_000;
    const recipient = await createTestUser();
    const challenge = await createChallenge(host.id, { stakeAmount });
    await prisma.quickMatchRecipient.create({ data: { challengeId: challenge.id, recipientUserId: recipient.id } });
    await prisma.user.update({ where: { id: host.id }, data: { walletBalance: { decrement: stakeAmount } } });
    await prisma.escrowTransaction.create({
      data: { quickMatchChallengeId: challenge.id, userId: host.id, type: "STAKE", amount: stakeAmount, status: "COMPLETE" },
    });

    await cancelQuickMatchChallenge(challenge.id, host.id);

    const cancelled = await prisma.quickMatchChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
    expect(cancelled.status).toBe("CANCELLED");
    const refundedHost = await prisma.user.findUniqueOrThrow({ where: { id: host.id } });
    expect(refundedHost.walletBalance).toBe(300_000);

    await expect(cancelQuickMatchChallenge(challenge.id, host.id)).rejects.toBeInstanceOf(ChallengeUnavailableError);
  });
});

describe("a failed accept (insufficient balance) reopens the challenge for other recipients", () => {
  it("recoverFailedAccept flips the challenge back to PENDING without refunding the host's still-locked stake", async () => {
    const host = await createTestUser({ walletBalance: 100_000 });
    const stakeAmount = 50_000;
    const brokeRecipient = await createTestUser({ walletBalance: 0 });
    const challenge = await createChallenge(host.id, { stakeAmount });
    await prisma.quickMatchRecipient.create({ data: { challengeId: challenge.id, recipientUserId: brokeRecipient.id } });
    await prisma.user.update({ where: { id: host.id }, data: { walletBalance: { decrement: stakeAmount } } });
    await prisma.escrowTransaction.create({
      data: { quickMatchChallengeId: challenge.id, userId: host.id, type: "STAKE", amount: stakeAmount, status: "COMPLETE" },
    });

    await prisma.quickMatchChallenge.updateMany({
      where: { id: challenge.id, status: "PENDING" },
      data: { status: "ACCEPTED", acceptedByUserId: brokeRecipient.id, acceptedAt: new Date() },
    });

    await expect(resolveQuickMatchAcceptance(challenge, brokeRecipient.id)).rejects.toBeInstanceOf(
      InsufficientWalletBalanceError
    );

    // The transaction's own atomicity means nothing partial needs manual
    // undoing except the standalone CAS from just above.
    await recoverFailedAccept(challenge.id, true);

    const reopened = await prisma.quickMatchChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
    expect(reopened.status).toBe("PENDING");
    expect(reopened.acceptedByUserId).toBeNull();
    // Host's stake was locked at creation, independent of this failed
    // accept attempt — must still be locked, not refunded, since the
    // challenge is reopened for other recipients to still win it.
    const hostAfter = await prisma.user.findUniqueOrThrow({ where: { id: host.id } });
    expect(hostAfter.walletBalance).toBe(50_000);
  });
});

describe("getEligibleRecipients", () => {
  it("excludes the host, suspended users, offline users, and those who can't afford the stake; includes everyone else", async () => {
    const host = await createTestUser();
    const online = await createTestUser({ lastActiveAt: new Date(), walletBalance: 100_000 });
    const offline = await createTestUser({ lastActiveAt: new Date(Date.now() - 5 * 60_000), walletBalance: 100_000 });
    const suspended = await createTestUser({ lastActiveAt: new Date(), walletBalance: 100_000, isSuspended: true });
    const broke = await createTestUser({ lastActiveAt: new Date(), walletBalance: 100 });

    const eligible = await getEligibleRecipients(host.id, { stakeAmount: 10_000 });
    const eligibleIds = eligible.map((u) => u.id);

    expect(eligibleIds).toContain(online.id);
    expect(eligibleIds).not.toContain(host.id);
    expect(eligibleIds).not.toContain(offline.id);
    expect(eligibleIds).not.toContain(suspended.id);
    expect(eligibleIds).not.toContain(broke.id);
  });

  it("excludes a user already in an active match", async () => {
    const host = await createTestUser();
    const busy = await createTestUser({ lastActiveAt: new Date(), walletBalance: 100_000 });
    const opponent = await createTestUser({ lastActiveAt: new Date(), walletBalance: 100_000 });
    await prisma.match.create({
      data: {
        matchCode: `TEST-QM-${Date.now()}`,
        playerAId: busy.id,
        playerBId: opponent.id,
        status: "NEEDS_RESULT",
      },
    });

    const eligible = await getEligibleRecipients(host.id, { stakeAmount: 0 });
    const eligibleIds = eligible.map((u) => u.id);
    expect(eligibleIds).not.toContain(busy.id);
    expect(eligibleIds).not.toContain(opponent.id);
  });
});

describe("sweepQuickMatchChallenges: the periodic safety net", () => {
  it("expires an overdue PENDING challenge nothing has polled since, and refunds the host", async () => {
    const host = await createTestUser({ walletBalance: 200_000 });
    const stakeAmount = 25_000;
    const challenge = await createChallenge(host.id, { stakeAmount, expiresAt: new Date(Date.now() - 10_000) });
    await prisma.user.update({ where: { id: host.id }, data: { walletBalance: { decrement: stakeAmount } } });
    await prisma.escrowTransaction.create({
      data: { quickMatchChallengeId: challenge.id, userId: host.id, type: "STAKE", amount: stakeAmount, status: "COMPLETE" },
    });

    const result = await sweepQuickMatchChallenges();
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect(result.errors).toHaveLength(0);

    const swept = await prisma.quickMatchChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
    expect(swept.status).toBe("EXPIRED");
    const refundedHost = await prisma.user.findUniqueOrThrow({ where: { id: host.id } });
    expect(refundedHost.walletBalance).toBe(200_000);
  });

  it("recovers a challenge stuck ACCEPTED with no Battle past the grace period, but leaves a recent one alone", async () => {
    const stuckHost = await createTestUser({ walletBalance: 100_000 });
    const stakeAmount = 10_000;
    const stuckChallenge = await createChallenge(stuckHost.id, { stakeAmount });
    await prisma.user.update({ where: { id: stuckHost.id }, data: { walletBalance: { decrement: stakeAmount } } });
    await prisma.escrowTransaction.create({
      data: { quickMatchChallengeId: stuckChallenge.id, userId: stuckHost.id, type: "STAKE", amount: stakeAmount, status: "COMPLETE" },
    });
    // Simulates the accept route's own standalone CAS winning, then its
    // consequence transaction AND the in-request recovery both failing —
    // the exact scenario this sweep exists for. acceptedAt well in the
    // past, past whatever grace period the sweep applies.
    await prisma.quickMatchChallenge.update({
      where: { id: stuckChallenge.id },
      data: { status: "ACCEPTED", acceptedAt: new Date(Date.now() - 10 * 60_000) },
    });

    const recentHost = await createTestUser({ walletBalance: 100_000 });
    const recentChallenge = await createChallenge(recentHost.id, { stakeAmount: 0 });
    await prisma.quickMatchChallenge.update({
      where: { id: recentChallenge.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() }, // still well within any real request's duration
    });

    const result = await sweepQuickMatchChallenges();
    expect(result.recoveredStuck).toBeGreaterThanOrEqual(1);

    const recoveredStuck = await prisma.quickMatchChallenge.findUniqueOrThrow({ where: { id: stuckChallenge.id } });
    expect(recoveredStuck.status).toBe("EXPIRED");
    const refundedHost = await prisma.user.findUniqueOrThrow({ where: { id: stuckHost.id } });
    expect(refundedHost.walletBalance).toBe(100_000);

    // Not touched — still within the grace window, so it's treated as
    // "might still be resolving," not stuck.
    const stillAccepted = await prisma.quickMatchChallenge.findUniqueOrThrow({ where: { id: recentChallenge.id } });
    expect(stillAccepted.status).toBe("ACCEPTED");
  });
});
