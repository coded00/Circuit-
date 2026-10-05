import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupAll, createTestOrganizer, createTestTournament, createTestUser } from "@/testHelpers";

afterEach(cleanupAll);

describe("append-only ledgers", () => {
  it("refuses to edit what an escrow row says, but lets its status move", async () => {
    const organizer = await createTestOrganizer();
    const t = await createTestTournament(organizer.id);
    const row = await prisma.escrowTransaction.create({ data: { tournamentId: t.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 10_000, status: "PENDING" } });

    await expect(prisma.escrowTransaction.update({ where: { id: row.id }, data: { amount: 99_999_999 } })).rejects.toThrow(/append-only/);
    await expect(prisma.escrowTransaction.update({ where: { id: row.id }, data: { type: "PRIZE_PAYOUT" } })).rejects.toThrow(/append-only/);
    await expect(prisma.escrowTransaction.update({ where: { id: row.id }, data: { userId: null } })).rejects.toThrow(/append-only/);

    const moved = await prisma.escrowTransaction.update({ where: { id: row.id }, data: { status: "COMPLETE" } });
    expect(moved.status).toBe("COMPLETE");
    expect(moved.amount).toBe(10_000);
  });

  it("refuses to edit a wallet ledger row's amount, kind or owner, but lets its status move", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const row = await prisma.walletTransaction.create({ data: { userId: a.id, type: "FUND", amount: 5_000, status: "PENDING" } });

    await expect(prisma.walletTransaction.update({ where: { id: row.id }, data: { amount: 1_000_000 } })).rejects.toThrow(/append-only/);
    await expect(prisma.walletTransaction.update({ where: { id: row.id }, data: { userId: b.id } })).rejects.toThrow(/append-only/);
    expect((await prisma.walletTransaction.update({ where: { id: row.id }, data: { status: "COMPLETE" } })).status).toBe("COMPLETE");
  });
});

describe("append-only ledgers: links", () => {
  it("lets an empty link be filled in and a deleted record's link be cleared, but never re-points a row", async () => {
    const organizer = await createTestOrganizer();
    const a = await createTestTournament(organizer.id);
    const b = await createTestTournament(organizer.id);
    const row = await prisma.escrowTransaction.create({ data: { userId: organizer.id, type: "STAKE", amount: 100, status: "COMPLETE" } });
    const linked = await prisma.escrowTransaction.update({ where: { id: row.id }, data: { tournamentId: a.id } }); // filled in later
    expect(linked.tournamentId).toBe(a.id);
    await expect(prisma.escrowTransaction.update({ where: { id: row.id }, data: { tournamentId: b.id } })).rejects.toThrow(/append-only/); // re-pointed
    expect((await prisma.escrowTransaction.update({ where: { id: row.id }, data: { tournamentId: null } })).tournamentId).toBeNull(); // cleared
  });
});
