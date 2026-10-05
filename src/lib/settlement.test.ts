import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { settleOrganizerRevenue } from "./settlement";
import { createTestOrganizer, cleanupAll } from "@/testHelpers";

/**
 * Regression tests for the Phase 9 fix: the credited total used to be
 * summed from a snapshot taken BEFORE the settlement transaction — a
 * registration confirming in that gap got flipped to COMPLETE by the
 * transaction's broader updateMany, but its amount was never included in
 * what got credited to the organizer's wallet. Money silently orphaned:
 * marked settled in the ledger, credited nowhere.
 */

afterEach(async () => {
  await cleanupAll();
});

async function makeReadyTournament(organizerId: string) {
  return prisma.tournament.create({
    data: {
      organizerId,
      name: `TEST-Tournament-${Date.now()}`,
      game: "Test Game",
      participantCap: 8,
      registrationOpenAt: new Date(Date.now() - 3_600_000),
      registrationCloseAt: new Date(Date.now() - 1_800_000),
      startAt: new Date(Date.now() - 900_000),
      status: "COMPLETE",
      completedAt: new Date(Date.now() - 48 * 3600_000), // well past the 24h default window
      payoutApprovedAt: new Date(), // staff have approved the payout
    },
  });
}

describe("settleOrganizerRevenue", () => {
  it("sums multiple PENDING rows for one tournament into a single correct credit", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await makeReadyTournament(organizer.id);
    await prisma.escrowTransaction.createMany({
      data: [
        { tournamentId: tournament.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 10_000, status: "PENDING" },
        { tournamentId: tournament.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 25_000, status: "PENDING" },
        { tournamentId: tournament.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 7_500, status: "PENDING" },
      ],
    });

    const before = await prisma.user.findUniqueOrThrow({ where: { id: organizer.id } });
    const result = await settleOrganizerRevenue();
    const after = await prisma.user.findUniqueOrThrow({ where: { id: organizer.id } });

    expect(result.settled).toBeGreaterThanOrEqual(1);
    expect(after.walletBalance).toBe(before.walletBalance + 42_500);

    const rows = await prisma.escrowTransaction.findMany({ where: { tournamentId: tournament.id, type: "ORGANIZER_REVENUE" } });
    expect(rows.every((r) => r.status === "COMPLETE")).toBe(true);

    const creditRows = await prisma.walletTransaction.findMany({ where: { userId: organizer.id, type: "ORGANIZER_REVENUE_CREDIT" } });
    expect(creditRows).toHaveLength(1);
    expect(creditRows[0].amount).toBe(42_500);
  });

  it("holds revenue while the tournament is inside its settlement window", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await prisma.tournament.create({
      data: {
        organizerId: organizer.id,
        name: `TEST-Tournament-${Date.now()}`,
        game: "Test Game",
        participantCap: 8,
        registrationOpenAt: new Date(Date.now() - 3_600_000),
        registrationCloseAt: new Date(Date.now() - 1_800_000),
        startAt: new Date(Date.now() - 900_000),
        status: "COMPLETE",
        completedAt: new Date(), // just now — well inside the 24h window
      },
    });
    const row = await prisma.escrowTransaction.create({
      data: { tournamentId: tournament.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 10_000, status: "PENDING" },
    });

    await settleOrganizerRevenue();

    const stillPending = await prisma.escrowTransaction.findUniqueOrThrow({ where: { id: row.id } });
    expect(stillPending.status).toBe("PENDING");
  });

  it("holds revenue while an open dispute exists on the tournament", async () => {
    const organizer = await createTestOrganizer();
    const player = await prisma.user.create({
      data: { displayName: `TEST-Player-${Date.now()}`, handle: `test-player-${Date.now()}`, emailOrPhone: `test-player-${Date.now()}@example.com` },
    });
    const tournament = await makeReadyTournament(organizer.id);
    const row = await prisma.escrowTransaction.create({
      data: { tournamentId: tournament.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 10_000, status: "PENDING" },
    });
    const match = await prisma.match.create({
      data: { tournamentId: tournament.id, matchCode: `TEST-DISPUTE-${Date.now()}`, playerAId: organizer.id, playerBId: player.id, status: "DISPUTED" },
    });
    const dispute = await prisma.dispute.create({ data: { matchId: match.id, raisedById: player.id, status: "OPEN" } });

    await settleOrganizerRevenue();
    const stillPending = await prisma.escrowTransaction.findUniqueOrThrow({ where: { id: row.id } });
    expect(stillPending.status).toBe("PENDING");

    await prisma.dispute.update({ where: { id: dispute.id }, data: { status: "RESOLVED" } });
    await settleOrganizerRevenue();
    const settledNow = await prisma.escrowTransaction.findUniqueOrThrow({ where: { id: row.id } });
    expect(settledNow.status).toBe("COMPLETE");
  });

  it("holds revenue while funds are frozen", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await makeReadyTournament(organizer.id);
    await prisma.tournament.update({ where: { id: tournament.id }, data: { fundsFrozen: true } });
    const row = await prisma.escrowTransaction.create({
      data: { tournamentId: tournament.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 10_000, status: "PENDING" },
    });

    await settleOrganizerRevenue();
    const stillPending = await prisma.escrowTransaction.findUniqueOrThrow({ where: { id: row.id } });
    expect(stillPending.status).toBe("PENDING");
  });

  it("a late-arriving row for an already-settled tournament is credited on a later run, never silently dropped", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await makeReadyTournament(organizer.id);
    await prisma.escrowTransaction.create({
      data: { tournamentId: tournament.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 10_000, status: "PENDING" },
    });
    await settleOrganizerRevenue();

    // A second, later row for the same tournament — e.g. a registration
    // that confirmed after the first sweep already ran.
    const lateRow = await prisma.escrowTransaction.create({
      data: { tournamentId: tournament.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 5_000, status: "PENDING" },
    });

    const before = await prisma.user.findUniqueOrThrow({ where: { id: organizer.id } });
    await settleOrganizerRevenue();
    const after = await prisma.user.findUniqueOrThrow({ where: { id: organizer.id } });

    expect(after.walletBalance).toBe(before.walletBalance + 5_000);
    const finalLateRow = await prisma.escrowTransaction.findUniqueOrThrow({ where: { id: lateRow.id } });
    expect(finalLateRow.status).toBe("COMPLETE");
  });

  it("running settlement again with nothing left PENDING is a pure no-op", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await makeReadyTournament(organizer.id);
    await prisma.escrowTransaction.create({
      data: { tournamentId: tournament.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 10_000, status: "PENDING" },
    });
    await settleOrganizerRevenue();

    const before = await prisma.user.findUniqueOrThrow({ where: { id: organizer.id } });
    await settleOrganizerRevenue();
    const after = await prisma.user.findUniqueOrThrow({ where: { id: organizer.id } });
    expect(after.walletBalance).toBe(before.walletBalance);
  });


  it("holds the organizer's share until staff approve the payout", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await makeReadyTournament(organizer.id);
    await prisma.tournament.update({ where: { id: tournament.id }, data: { payoutApprovedAt: null } });
    await prisma.escrowTransaction.create({ data: { tournamentId: tournament.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 20_000, status: "PENDING" } });

    const before = await prisma.user.findUniqueOrThrow({ where: { id: organizer.id } });
    await settleOrganizerRevenue();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: organizer.id } })).walletBalance).toBe(before.walletBalance);

    await prisma.tournament.update({ where: { id: tournament.id }, data: { payoutApprovedAt: new Date() } });
    await settleOrganizerRevenue();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: organizer.id } })).walletBalance).toBe(before.walletBalance + 20_000);
  });

  describe("prizes come out of entry fees", () => {
    it("sets the prize aside and credits the organizer only what is left", async () => {
      const organizer = await createTestOrganizer();
      const tournament = await prisma.tournament.update({ where: { id: (await makeReadyTournament(organizer.id)).id }, data: { prizeAmount: 30_000 } });
      await prisma.escrowTransaction.createMany({
        data: [
          { tournamentId: tournament.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 25_000, status: "PENDING" },
          { tournamentId: tournament.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 25_000, status: "PENDING" },
        ],
      });
      const before = await prisma.user.findUniqueOrThrow({ where: { id: organizer.id } });
      await settleOrganizerRevenue();
      const after = await prisma.user.findUniqueOrThrow({ where: { id: organizer.id } });
      expect(after.walletBalance).toBe(before.walletBalance + 20_000); // 50,000 collected - 30,000 prize
    });

    it("credits nothing when the prize uses up everything collected", async () => {
      const organizer = await createTestOrganizer();
      const tournament = await prisma.tournament.update({ where: { id: (await makeReadyTournament(organizer.id)).id }, data: { prizeAmount: 100_000 } });
      await prisma.escrowTransaction.create({ data: { tournamentId: tournament.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 40_000, status: "PENDING" } });
      const before = await prisma.user.findUniqueOrThrow({ where: { id: organizer.id } });
      await settleOrganizerRevenue();
      const after = await prisma.user.findUniqueOrThrow({ where: { id: organizer.id } });
      expect(after.walletBalance).toBe(before.walletBalance);
      expect(await prisma.walletTransaction.count({ where: { userId: organizer.id, type: "ORGANIZER_REVENUE_CREDIT" } })).toBe(0);
    });

    it("keeps nothing back on a staff-run (sponsored) tournament", async () => {
      const staff = await createTestOrganizer({ isStaff: true });
      const tournament = await prisma.tournament.update({ where: { id: (await makeReadyTournament(staff.id)).id }, data: { prizeAmount: 30_000 } });
      await prisma.escrowTransaction.create({ data: { tournamentId: tournament.id, userId: staff.id, type: "ORGANIZER_REVENUE", amount: 50_000, status: "PENDING" } });
      const before = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
      await settleOrganizerRevenue();
      const after = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
      expect(after.walletBalance).toBe(before.walletBalance + 50_000);
    });
  });
});
