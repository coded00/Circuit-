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
