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
});
