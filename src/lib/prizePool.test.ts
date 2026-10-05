import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupAll, createTestOrganizer, createTestTournament } from "@/testHelpers";
import { maxPrizePool, payableFraction, prizeFundingError } from "@/lib/prizePool";

afterEach(cleanupAll);

describe("prize funding rules", () => {
  it("caps a prize at the entry fees every spot could collect, after the platform fee", () => {
    // 10 spots x (1,000 - 10% fee) = 9,000
    expect(maxPrizePool(1_000, 10, 1000)).toBe(9_000);
    expect(prizeFundingError({ prizeAmount: 9_000, entryFee: 1_000, participantCap: 10, platformFeeBps: 1000 })).toBeNull();
    expect(prizeFundingError({ prizeAmount: 9_001, entryFee: 1_000, participantCap: 10, platformFeeBps: 1000 })).toMatch(/can't be more than/);
  });
  it("refuses any cash prize on a free tournament", () => {
    expect(prizeFundingError({ prizeAmount: 1, entryFee: 0, participantCap: 64, platformFeeBps: 0 })).toMatch(/free tournament/);
  });
  it("allows no prize at all", () => {
    expect(prizeFundingError({ prizeAmount: null, entryFee: 0, participantCap: 8, platformFeeBps: 0 })).toBeNull();
    expect(prizeFundingError({ prizeAmount: 0, entryFee: 0, participantCap: 8, platformFeeBps: 0 })).toBeNull();
  });
});

describe("payableFraction", () => {
  it("pays in full when the fees collected cover the prize, and proportionally when they do not", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await createTestTournament(organizer.id, { prizeAmount: 10_000, entryFee: 1_000 });
    expect(await payableFraction(tournament)).toBe(0); // nothing collected yet
    await prisma.escrowTransaction.create({ data: { tournamentId: tournament.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 4_000, status: "PENDING" } });
    expect(await payableFraction(tournament)).toBeCloseTo(0.4);
    await prisma.escrowTransaction.create({ data: { tournamentId: tournament.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 9_000, status: "COMPLETE" } });
    expect(await payableFraction(tournament)).toBe(1);
  });
  it("ignores refunded entries and always pays a staff-run tournament in full", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await createTestTournament(organizer.id, { prizeAmount: 10_000, entryFee: 1_000 });
    await prisma.escrowTransaction.create({ data: { tournamentId: tournament.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 10_000, status: "FAILED" } });
    expect(await payableFraction(tournament)).toBe(0);
    const staff = await createTestOrganizer({ isStaff: true });
    const sponsored = await createTestTournament(staff.id, { prizeAmount: 10_000, entryFee: 0 });
    expect(await payableFraction(sponsored)).toBe(1);
  });
});
