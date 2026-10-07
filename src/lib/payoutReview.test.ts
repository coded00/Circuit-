import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupAll, createTestOrganizer, createTestTournament, createTestUser } from "@/testHelpers";
import { reviewTournamentPayout } from "@/lib/payoutReview";

afterEach(cleanupAll);

describe("reviewTournamentPayout", () => {
  it("reports collected money, the prize set aside, and what is left for the organizer", async () => {
    const organizer = await createTestOrganizer();
    const t = await createTestTournament(organizer.id, { status: "COMPLETE", completedAt: new Date(), prizeAmount: 30_000, entryFee: 25_000 });
    await prisma.escrowTransaction.createMany({
      data: [
        { tournamentId: t.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 25_000, status: "PENDING" },
        { tournamentId: t.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 25_000, status: "PENDING" },
        { tournamentId: t.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 25_000, status: "FAILED" }, // a refunded entry
      ],
    });
    const review = await reviewTournamentPayout(t);
    expect(review.collectedForPrizes).toBe(50_000);
    expect(review.declaredPrize).toBe(30_000);
    expect(review.organizerShare).toBe(20_000);
    // None of this is Circuit's money: the prize and the organizer's share together are exactly what the
    // players paid, so there is nothing here for a person to have to decide.
    expect(review.sponsored).toBe(false);
    expect(review.unbackedAmount).toBe(0);
  });

  it("reports a staff-run (sponsored) tournament's prize as unbacked — it is Circuit's own money", async () => {
    // Staff organizers are exempt from the rule that a prize can't exceed the entry fees collected
    // (src/lib/prizePool.ts), which is what a sponsorship is. The review has to say so, because it is the
    // one case where approving the payout spends the platform's balance rather than the players'.
    const organizer = await createTestOrganizer({ isStaff: true });
    const champion = await createTestUser();
    const runnerUp = await createTestUser();
    const t = await createTestTournament(organizer.id, { status: "COMPLETE", completedAt: new Date(), prizeAmount: 200_000 });
    await prisma.match.create({
      data: { tournamentId: t.id, round: 1, playerAId: champion.id, playerBId: runnerUp.id, status: "COMPLETE", winnerId: champion.id, matchCode: `TEST-${Date.now()}` },
    });

    const review = await reviewTournamentPayout(t);
    expect(review.sponsored).toBe(true);
    expect(review.payablePrize).toBe(200_000); // payable in full, unlike an ordinary tournament with nothing collected
    expect(review.unbackedAmount).toBe(200_000); // and all of it is platform money
    expect(review.blockers).toEqual([]); // legitimate, not a fault — a person just has to be the one to approve it
  });

  it("lists what should hold the release back", async () => {
    const organizer = await createTestOrganizer();
    const player = await createTestUser();
    const open = await createTestTournament(organizer.id, { status: "LIVE" });
    expect((await reviewTournamentPayout(open)).blockers).toContain("The tournament isn't complete yet.");

    const frozen = await createTestTournament(organizer.id, { status: "COMPLETE", completedAt: new Date(), fundsFrozen: true });
    expect((await reviewTournamentPayout(frozen)).blockers).toContain("Funds are frozen.");
    void player;
  });
});
