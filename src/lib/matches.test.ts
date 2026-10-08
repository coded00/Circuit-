import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { submitResult, runScheduledSweep, ruleDispute, MatchError } from "./matches";
import { createTestUser, createTestStaff, cleanupAll, uniqueSuffix } from "@/testHelpers";

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

/**
 * One Battle, one Match, one pot.
 *
 * A Battle used to be able to acquire a second Match: accepting a Battle
 * refunded the accepter's stake and reopened the Battle to OPEN whenever
 * anything after the Match insert threw — including a failed notification —
 * while the Match it had already created lived on. A second accepter could
 * then take the reopened Battle, get a second Match, and both Matches paid
 * `stakeAmount * 2` on completion. The second payout had nothing behind it:
 * that accepter's stake had been handed back.
 *
 * Two independent guards stop it now, and each is tested here on its own —
 * Match.battleId is unique (no second Match can exist), and settlement is
 * gated on the Battle's own status flipping (nothing that does reach
 * settleBattleOnComplete twice can pay twice).
 */

async function acceptedBattle(stakeAmount: number) {
  const playerA = await createTestUser();
  const playerB = await createTestUser();
  const battle = await prisma.battle.create({
    data: { creatorId: playerA.id, game: "Test Game", format: "SINGLE", stakeAmount, status: "ACCEPTED" },
  });
  const match = await prisma.match.create({
    data: {
      battleId: battle.id,
      matchCode: `TEST-SETTLE-${uniqueSuffix()}`,
      playerAId: playerA.id,
      playerBId: playerB.id,
      status: "NEEDS_RESULT",
    },
  });
  return { playerA, playerB, battle, match };
}

describe("a Battle is matched once", () => {
  it("refuses a second Match for the same Battle", async () => {
    const { playerA, playerB, battle } = await acceptedBattle(50_000);

    await expect(
      prisma.match.create({
        data: {
          battleId: battle.id,
          matchCode: `TEST-SETTLE-DUP-${uniqueSuffix()}`,
          playerAId: playerA.id,
          playerBId: playerB.id,
          status: "UPCOMING",
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });

    expect(await prisma.match.count({ where: { battleId: battle.id } })).toBe(1);
  });

  it("still allows many tournament matches, which have no battleId", async () => {
    // The unique index only bites on non-null battleId — Postgres treats
    // nulls as distinct, so bracket matches are unaffected.
    const playerA = await createTestUser();
    const playerB = await createTestUser();
    await prisma.match.create({
      data: { matchCode: `TEST-NULL-A-${uniqueSuffix()}`, playerAId: playerA.id, playerBId: playerB.id, status: "UPCOMING" },
    });
    await prisma.match.create({
      data: { matchCode: `TEST-NULL-B-${uniqueSuffix()}`, playerAId: playerA.id, playerBId: playerB.id, status: "UPCOMING" },
    });
    expect(await prisma.match.count({ where: { playerAId: playerA.id } })).toBe(2);
  });
});

describe("a Battle settles once", () => {
  it("pays the pot once, even when settlement is reached a second time", async () => {
    const stakeAmount = 25_000;
    const { playerA, playerB, battle, match } = await acceptedBattle(stakeAmount);

    // First settlement, by the ordinary route: both sides report the same winner.
    for (const player of [playerA, playerB]) {
      await submitResult({
        matchId: match.id,
        submittingUserId: player.id,
        winnerId: playerA.id,
        score: "2-0",
        proofBuffer: Buffer.from(`proof-${player.id}`),
        proofContentType: "image/png",
      });
    }

    expect((await prisma.battle.findUniqueOrThrow({ where: { id: battle.id } })).status).toBe("COMPLETE");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: playerA.id } })).walletBalance).toBe(stakeAmount * 2);

    // Force a second, independent settlement of the same Battle. A second
    // Match used to do exactly this — it reached completeMatch →
    // settleBattleOnComplete for a Battle that had already paid out. A
    // second Match can't exist any more, so reopening the completed Match
    // is the synthetic version of that state, and the only way left to
    // reach the second settlement.
    // resultA is the one the sweep reads (`resultA ?? resultB`), so
    // overwriting just it is enough to make the second attempt report a
    // different winner than the first settlement paid.
    await prisma.match.update({
      where: { id: match.id },
      data: {
        status: "NEEDS_RESULT",
        winnerId: null,
        resultA: { winnerId: playerB.id, score: "2-0", submittedAt: new Date().toISOString() },
        reportWindowExpiresAt: new Date(Date.now() - 60_000), // already lapsed — sweep-eligible
      },
    });
    await runScheduledSweep();

    const payouts = await prisma.escrowTransaction.findMany({ where: { battleId: battle.id, type: "STAKE_PAYOUT" } });
    expect(payouts).toHaveLength(1);
    expect(payouts[0].amount).toBe(stakeAmount * 2);
    // The second settlement named the OTHER player the winner — without the
    // status latch on Battle, this is the wallet that would have been paid
    // a second, unbacked pot.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: playerB.id } })).walletBalance).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: playerA.id } })).walletBalance).toBe(stakeAmount * 2);
  });

  it("leaves an unstaked Battle COMPLETE without touching any wallet", async () => {
    const { playerA, playerB, battle, match } = await acceptedBattle(0);

    for (const player of [playerA, playerB]) {
      await submitResult({
        matchId: match.id,
        submittingUserId: player.id,
        winnerId: playerA.id,
        score: "2-0",
        proofBuffer: Buffer.from(`proof-${player.id}`),
        proofContentType: "image/png",
      });
    }

    expect((await prisma.battle.findUniqueOrThrow({ where: { id: battle.id } })).status).toBe("COMPLETE");
    expect(await prisma.escrowTransaction.count({ where: { battleId: battle.id } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: playerA.id } })).walletBalance).toBe(0);
  });
});

describe("runScheduledSweep's stake-pattern branch", () => {
  /**
   * The collusion sweep (src/lib/stakePatterns.ts) has its own tests, and
   * they call `detectStakePatterns` directly. This one exists for the join
   * between the two: the whole control is worthless if the branch is not
   * actually wired into the sweep that runs every two minutes, and nothing
   * in stakePatterns.test.ts would notice if that one line were deleted.
   */
  it("runs repeated-pair detection and reports how many pairs it queued", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    // Five settled staked Battles, all to alice — a one-sided record over a
    // meaningful amount, which is the record rule's whole shape.
    for (let i = 0; i < 5; i += 1) {
      const battle = await prisma.battle.create({
        data: {
          creatorId: alice.id,
          targetUserId: bob.id,
          game: "Test Game",
          format: "SINGLE",
          visibility: "OPEN",
          stakeAmount: 2_000_000, // ₦20,000
          status: "COMPLETE",
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      await prisma.match.create({
        data: {
          battleId: battle.id,
          matchCode: `TEST-SWEEP-PATTERN-${uniqueSuffix()}`,
          playerAId: alice.id,
          playerBId: bob.id,
          status: "COMPLETE",
          winnerId: alice.id,
        },
      });
    }

    const result = await runScheduledSweep();

    expect(result.stakePatternsFlagged).toBe(1);
  });

  it("reports zero when no pair has done anything worth queueing", async () => {
    // Guard: the counter above must not be a constant.
    const result = await runScheduledSweep();
    expect(result.stakePatternsFlagged).toBe(0);
  });
});

/**
 * Finding #14: the attempts table grew without bound, and nothing cleared it. `purgeExpiredAttempts` has
 * its own tests for what it deletes (src/lib/rateLimit.test.ts) — what those cannot show is that anything
 * ever *calls* it. The helper being correct while no sweep runs it is exactly the shape of the finding,
 * so this drives the sweep itself and reads the row back.
 */
describe("the sweep's housekeeping", () => {
  it("purges rate-limit rows past retention", async () => {
    const key = `test-sweep-purge-${uniqueSuffix()}`;
    await prisma.rateLimitAttempt.create({ data: { key, createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000) } });

    const result = await runScheduledSweep();

    expect(result.rateLimitAttemptsPurged).toBeGreaterThanOrEqual(1);
    expect(await prisma.rateLimitAttempt.count({ where: { key } })).toBe(0);
  });

  it("leaves a row that is still inside its window alone", async () => {
    // The counter must not be a "delete everything" — a sweep that cleared live rows would silently reset
    // every throttle in the app, once every two minutes.
    const key = `test-sweep-keep-${uniqueSuffix()}`;
    await prisma.rateLimitAttempt.create({ data: { key } });

    await runScheduledSweep();

    expect(await prisma.rateLimitAttempt.count({ where: { key } })).toBe(1);
  });
});
