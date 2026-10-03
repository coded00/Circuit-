import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { confirmResult, submitResult, MatchError } from "./matches";
import { createTestUser, cleanupAll } from "@/testHelpers";

/**
 * Confirm-or-dispute: the second player agrees with the first player's
 * reported result instead of reporting their own. A confirmation is stored
 * as their matching report, so it must finish the match through the same
 * path as two agreeing reports — one payout, no second code path.
 */

afterEach(async () => {
  await cleanupAll();
});

async function reportedMatch(opts: { stake?: number } = {}) {
  const playerA = await createTestUser();
  const playerB = await createTestUser({ walletBalance: 1_000_000 });
  const stakeAmount = opts.stake ?? 0;
  const battle = await prisma.battle.create({
    data: { creatorId: playerA.id, game: "Test Game", format: "SINGLE", stakeAmount, status: "ACCEPTED" },
  });
  const match = await prisma.match.create({
    data: {
      battleId: battle.id,
      matchCode: `TEST-CONFIRM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      playerAId: playerA.id,
      playerBId: playerB.id,
      status: "NEEDS_RESULT",
      resultA: { winnerId: playerA.id, score: "2-0", submittedAt: new Date().toISOString() },
      proofARef: "test-proof-a",
      reportWindowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return { playerA, playerB, battle, match, stakeAmount };
}

describe("confirmResult", () => {
  it("completes the match with the opponent's reported winner and records the confirmation without new proof", async () => {
    const { playerA, playerB, match } = await reportedMatch();

    const { outcome } = await confirmResult({ matchId: match.id, confirmingUserId: playerB.id });
    expect(outcome).toBe("AUTO_COMPLETED");

    const done = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(done.status).toBe("COMPLETE");
    expect(done.winnerId).toBe(playerA.id);
    expect(done.resultB).toMatchObject({ winnerId: playerA.id, score: "2-0", confirmed: true });
    expect(done.proofBRef).toBeNull();
  });

  it("pays a staked Battle's pot exactly once", async () => {
    const { playerA, playerB, battle, match, stakeAmount } = await reportedMatch({ stake: 50_000 });

    await confirmResult({ matchId: match.id, confirmingUserId: playerB.id });

    const payouts = await prisma.escrowTransaction.findMany({ where: { battleId: battle.id, type: "STAKE_PAYOUT" } });
    expect(payouts).toHaveLength(1);
    expect(payouts[0].amount).toBe(stakeAmount * 2);
    const winner = await prisma.user.findUniqueOrThrow({ where: { id: playerA.id } });
    expect(winner.walletBalance).toBe(stakeAmount * 2);
  });

  it("refuses when the opponent hasn't reported yet", async () => {
    const playerA = await createTestUser();
    const playerB = await createTestUser();
    const match = await prisma.match.create({
      data: { matchCode: `TEST-CONFIRM-NONE-${Date.now()}`, playerAId: playerA.id, playerBId: playerB.id, status: "UPCOMING" },
    });
    await expect(confirmResult({ matchId: match.id, confirmingUserId: playerB.id })).rejects.toMatchObject({ code: "NOTHING_TO_CONFIRM" });
  });

  it("refuses the player who made the report, and anyone who isn't in the match", async () => {
    const { playerA, match } = await reportedMatch();
    const outsider = await createTestUser();
    await expect(confirmResult({ matchId: match.id, confirmingUserId: playerA.id })).rejects.toMatchObject({ code: "ALREADY_RESOLVED" });
    await expect(confirmResult({ matchId: match.id, confirmingUserId: outsider.id })).rejects.toBeInstanceOf(MatchError);
    await expect(confirmResult({ matchId: match.id, confirmingUserId: outsider.id })).rejects.toMatchObject({ code: "NOT_A_PARTICIPANT" });
  });

  it("can't confirm a match that's already finished", async () => {
    const { playerB, match } = await reportedMatch();
    await confirmResult({ matchId: match.id, confirmingUserId: playerB.id });
    await expect(confirmResult({ matchId: match.id, confirmingUserId: playerB.id })).rejects.toMatchObject({ code: "ALREADY_COMPLETE" });
  });

  it("disputing still works: reporting a different result opens a dispute instead of completing", async () => {
    const { playerB, match } = await reportedMatch();
    const { outcome } = await submitResult({
      matchId: match.id,
      submittingUserId: playerB.id,
      winnerId: playerB.id,
      score: "0-2",
      proofBuffer: Buffer.from("fake-proof"),
      proofContentType: "image/png",
    });
    expect(outcome).toBe("DISPUTED");
  });
});
