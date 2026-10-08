import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

/**
 * The sponsored-prize ceiling at payout time.
 *
 * The ceiling is checked where a prize is declared (src/lib/prizePool.ts, and both tournament routes).
 * This is the other half, and it exists because a ceiling can be lowered after a prize was declared
 * underneath a looser one — a declaration-only check would wave that prize straight through. Blocking
 * here stops the money at the door and puts the reason on the Payouts page, in front of the person
 * about to approve it.
 */
describe("the sponsored-prize ceiling", () => {
  const CEILING = 100_000; // ₦1,000, small enough that a fixture can exceed it
  let original: { maxSponsoredPrizeKobo: number } | null = null;

  beforeEach(async () => {
    original = await prisma.platformSetting.findUnique({
      where: { id: "singleton" },
      select: { maxSponsoredPrizeKobo: true },
    });
    await prisma.platformSetting.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", maxSponsoredPrizeKobo: CEILING },
      update: { maxSponsoredPrizeKobo: CEILING },
    });
  });

  afterEach(async () => {
    if (original) {
      await prisma.platformSetting.update({ where: { id: "singleton" }, data: original });
    } else {
      await prisma.platformSetting.deleteMany({ where: { id: "singleton" } });
    }
  });

  async function sponsored(prizeAmount: number) {
    const organizer = await createTestOrganizer({ isStaff: true });
    const champion = await createTestUser();
    const runnerUp = await createTestUser();
    const t = await createTestTournament(organizer.id, { status: "COMPLETE", completedAt: new Date(), prizeAmount });
    await prisma.match.create({
      data: { tournamentId: t.id, round: 1, playerAId: champion.id, playerBId: runnerUp.id, status: "COMPLETE", winnerId: champion.id, matchCode: `TEST-${Date.now()}` },
    });
    return reviewTournamentPayout(t);
  }

  it("blocks a sponsored prize above the ceiling, and says how far above", async () => {
    const review = await sponsored(CEILING + 1);

    expect(review.sponsored).toBe(true);
    expect(review.blockers.join(" ")).toMatch(/above the ₦1,000 ceiling for a sponsored prize/);
  });

  it("allows a sponsored prize exactly at the ceiling", async () => {
    // The guard test again: this is the boundary a real event sits on, and blocking it would be a
    // regression dressed as a fix.
    const review = await sponsored(CEILING);

    expect(review.blockers).toEqual([]);
  });

  it("leaves an ordinary tournament alone — its prize is bounded by the entry fees, not this", async () => {
    // The ceiling is about platform money. An ordinary organizer cannot exceed what players paid, so a
    // prize above the sponsored ceiling on a self-funded tournament is not this rule's business.
    const organizer = await createTestOrganizer();
    const champion = await createTestUser();
    const runnerUp = await createTestUser();
    const t = await createTestTournament(organizer.id, { status: "COMPLETE", completedAt: new Date(), prizeAmount: CEILING * 10, entryFee: 100_000 });
    await prisma.escrowTransaction.create({ data: { tournamentId: t.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: CEILING * 10, status: "COMPLETE" } });
    await prisma.match.create({
      data: { tournamentId: t.id, round: 1, playerAId: champion.id, playerBId: runnerUp.id, status: "COMPLETE", winnerId: champion.id, matchCode: `TEST-${Date.now()}` },
    });

    const review = await reviewTournamentPayout(t);

    expect(review.sponsored).toBe(false);
    expect(review.blockers).toEqual([]);
  });
});
