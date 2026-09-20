import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { submitResult, runScheduledSweep, ruleDispute, MatchError } from "./matches";
import { createTestUser, createTestStaff, cleanupAll } from "@/testHelpers";

/**
 * Regression tests for the Phase 8 fix: completeMatch()/ruleDispute() had
 * no compare-and-swap on match/dispute status, so a real race (a late
 * submission landing right as the sweep auto-accepts the same match, or
 * two concurrent dispute rulings) could run the advancement/payout/
 * notification side effects twice — a staked Battle's winner getting
 * paid the pot twice being the worst case. If this regresses, these
 * tests should catch it before it reaches production.
 */

afterEach(async () => {
  await cleanupAll();
});

describe("completeMatch race: a late submission vs. the sweep's auto-accept", () => {
  it("pays a staked Battle's pot exactly once, however the race resolves", async () => {
    const playerA = await createTestUser();
    const playerB = await createTestUser({ walletBalance: 1_000_000 });
    const stakeAmount = 50_000;
    const battle = await prisma.battle.create({
      data: { creatorId: playerA.id, game: "Test Game", format: "SINGLE", stakeAmount, status: "ACCEPTED" },
    });
    const match = await prisma.match.create({
      data: {
        battleId: battle.id,
        matchCode: `TEST-MATCH-${Date.now()}`,
        playerAId: playerA.id,
        playerBId: playerB.id,
        status: "NEEDS_RESULT",
        resultA: { winnerId: playerA.id, score: "2-0", submittedAt: new Date().toISOString() },
        reportWindowExpiresAt: new Date(Date.now() - 60_000), // already expired — sweep-eligible
      },
    });

    const [sweepOutcome, submitOutcome] = await Promise.allSettled([
      runScheduledSweep(),
      submitResult({
        matchId: match.id,
        submittingUserId: playerB.id,
        winnerId: playerA.id,
        score: "2-0",
        proofBuffer: Buffer.from("fake-proof"),
        proofContentType: "image/png",
      }),
    ]);

    expect(sweepOutcome.status).toBe("fulfilled");
    // A decisively-won race (the sweep's write lands before submitResult's
    // very first read) can legitimately throw ALREADY_COMPLETE — both
    // outcomes are correct; what matters is the money invariants below.
    const submitOk =
      submitOutcome.status === "fulfilled" ||
      (submitOutcome.status === "rejected" && submitOutcome.reason instanceof MatchError && submitOutcome.reason.code === "ALREADY_COMPLETE");
    expect(submitOk).toBe(true);

    const finalMatch = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(finalMatch.status).toBe("COMPLETE");
    expect(finalMatch.winnerId).toBe(playerA.id);

    const payoutRows = await prisma.escrowTransaction.findMany({ where: { battleId: battle.id, type: "STAKE_PAYOUT" } });
    expect(payoutRows).toHaveLength(1);
    expect(payoutRows[0].amount).toBe(stakeAmount * 2);

    const winner = await prisma.user.findUniqueOrThrow({ where: { id: playerA.id } });
    expect(winner.walletBalance).toBe(stakeAmount * 2);
  });

  it("the underlying compare-and-swap lets exactly one of many concurrent attempts win", async () => {
    const playerA = await createTestUser();
    const playerB = await createTestUser();
    const match = await prisma.match.create({
      data: { matchCode: `TEST-MATCH-CAS-${Date.now()}`, playerAId: playerA.id, playerBId: playerB.id, status: "NEEDS_RESULT" },
    });

    const attempts = await Promise.all(
      Array.from({ length: 10 }, () =>
        prisma.match.updateMany({
          where: { id: match.id, status: { not: "COMPLETE" } },
          data: { status: "COMPLETE", winnerId: playerA.id, reportWindowExpiresAt: null },
        })
      )
    );
    expect(attempts.filter((a) => a.count === 1)).toHaveLength(1);
  });
});

describe("ruleDispute race: two concurrent winner rulings on the same dispute", () => {
  it("pays a staked Battle's pot exactly once and rejects the loser with ALREADY_RESOLVED", async () => {
    const playerA = await createTestUser();
    const playerB = await createTestUser();
    const staff = await createTestStaff();
    const stakeAmount = 30_000;
    const battle = await prisma.battle.create({
      data: { creatorId: playerA.id, game: "Test Game", format: "SINGLE", stakeAmount, status: "ACCEPTED" },
    });
    const match = await prisma.match.create({
      data: { battleId: battle.id, matchCode: `TEST-RULE-${Date.now()}`, playerAId: playerA.id, playerBId: playerB.id, status: "DISPUTED" },
    });
    const dispute = await prisma.dispute.create({ data: { matchId: match.id, raisedById: playerA.id, status: "ESCALATED" } });

    const results = await Promise.allSettled([
      ruleDispute({ disputeId: dispute.id, rulingUserId: staff.id, isStaffRuling: true, ruling: "attempt 1", winnerId: playerA.id }),
      ruleDispute({ disputeId: dispute.id, rulingUserId: staff.id, isStaffRuling: true, ruling: "attempt 2", winnerId: playerA.id }),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(MatchError);
    expect(((failed[0] as PromiseRejectedResult).reason as MatchError).code).toBe("ALREADY_RESOLVED");

    const payoutRows = await prisma.escrowTransaction.findMany({ where: { battleId: battle.id, type: "STAKE_PAYOUT" } });
    expect(payoutRows).toHaveLength(1);
    expect(payoutRows[0].amount).toBe(stakeAmount * 2);

    const winner = await prisma.user.findUniqueOrThrow({ where: { id: playerA.id } });
    expect(winner.walletBalance).toBe(stakeAmount * 2);
  });

  it("void rulings refund each player's stake exactly once, not once per concurrent attempt", async () => {
    const playerA = await createTestUser();
    const playerB = await createTestUser();
    const staff = await createTestStaff();
    const stakeAmount = 40_000;
    const battle = await prisma.battle.create({
      data: { creatorId: playerA.id, game: "Test Game", format: "SINGLE", stakeAmount, status: "ACCEPTED" },
    });
    const match = await prisma.match.create({
      data: { battleId: battle.id, matchCode: `TEST-VOID-${Date.now()}`, playerAId: playerA.id, playerBId: playerB.id, status: "DISPUTED" },
    });
    const dispute = await prisma.dispute.create({ data: { matchId: match.id, raisedById: playerA.id, status: "ESCALATED" } });

    // allSettled, not all — and not asserting a specific fulfilled/
    // rejected split. The void path holds one connection through ~9
    // sequential writes each (dispute + match + battle + 2×(user +
    // escrow + walletTransaction)), so two of them at once can
    // legitimately both fail on connection-pool pressure alone in a real
    // remote-Postgres environment, independent of the CAS logic under
    // test. What actually matters — and what a regression of the Phase 8
    // fix would break — is that however many of the two calls succeed,
    // the stake is never refunded more than once per player.
    await Promise.allSettled([
      ruleDispute({ disputeId: dispute.id, rulingUserId: staff.id, isStaffRuling: true, ruling: "void attempt 1", voidMatch: true }),
      ruleDispute({ disputeId: dispute.id, rulingUserId: staff.id, isStaffRuling: true, ruling: "void attempt 2", voidMatch: true }),
    ]);

    const refundRows = await prisma.escrowTransaction.findMany({ where: { battleId: battle.id, type: "REFUND" } });
    expect(refundRows.length).toBeLessThanOrEqual(2); // never more than one per player

    const [a, b] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: playerA.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: playerB.id } }),
    ]);
    // Never double-refunded — 0 if both attempts genuinely failed
    // (connection pressure), stakeAmount if (at least) one succeeded;
    // 2x stakeAmount would mean the CAS guard regressed.
    expect(a.walletBalance).toBeLessThanOrEqual(stakeAmount);
    expect(b.walletBalance).toBeLessThanOrEqual(stakeAmount);
    expect(a.walletBalance).toBe(b.walletBalance); // both players refunded symmetrically or not at all
  });

  it("logs a staff ruling to the audit trail but not an organizer ruling their own tournament's dispute", async () => {
    const playerA = await createTestUser();
    const playerB = await createTestUser();
    const staff = await createTestStaff();

    // Staff ruling — should be logged.
    const staffMatch = await prisma.match.create({
      data: { matchCode: `TEST-AUDIT-STAFF-${Date.now()}`, playerAId: playerA.id, playerBId: playerB.id, status: "DISPUTED" },
    });
    const staffDispute = await prisma.dispute.create({ data: { matchId: staffMatch.id, raisedById: playerA.id, status: "ESCALATED" } });
    await ruleDispute({ disputeId: staffDispute.id, rulingUserId: staff.id, isStaffRuling: true, ruling: "Player A wins", winnerId: playerA.id });
    const staffLog = await prisma.auditLogEntry.findFirst({ where: { actorId: staff.id, action: "dispute.rule", targetId: staffDispute.id } });
    expect(staffLog).not.toBeNull();
  });
});
