import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupAll, createTestOrganizer, createTestTournament, createTestUser } from "@/testHelpers";
import { approveTournamentPayout, autoApprovePayouts } from "@/lib/payoutApproval";
import { formatNotification } from "@/lib/notification-format";

const PAST = () => new Date(Date.now() - 48 * 3600_000); // well past the 24h wait

async function paidTournament(over: Record<string, unknown> = {}) {
  const organizer = await createTestOrganizer();
  const t = await createTestTournament(organizer.id, { status: "COMPLETE", completedAt: PAST(), entryFee: 100_000, ...over });
  await prisma.escrowTransaction.createMany({
    data: [
      { tournamentId: t.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 95_000, status: "PENDING" },
      { tournamentId: t.id, type: "PLATFORM_FEE", amount: 5_000, status: "COMPLETE" },
    ],
  });
  return { organizer, t };
}
const approvedAt = async (id: string) => (await prisma.tournament.findUniqueOrThrow({ where: { id } })).payoutApprovedAt;

beforeEach(async () => {
  await prisma.platformSetting.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: { payoutAutoApprove: true, payoutAutoApproveMaxKobo: 50_000_000, organizerRevenueSettlementHours: 24 } });
});
afterEach(cleanupAll);

describe("autoApprovePayouts", () => {
  it("approves a clean finished tournament and tells the organizer", async () => {
    const { organizer, t } = await paidTournament();
    const result = await autoApprovePayouts();
    expect(result.approved).toBeGreaterThanOrEqual(1);
    const row = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.payoutApprovedAt).not.toBeNull();
    expect(row.payoutApprovedById).toBeNull(); // the system, not a person
    const alerts = await prisma.notification.findMany({ where: { userId: organizer.id, type: "ORGANIZER_PAYOUT_APPROVED" } });
    expect(alerts).toHaveLength(1);
  });

  it("does nothing while the settlement wait has not passed", async () => {
    const { t } = await paidTournament({ completedAt: new Date() });
    await autoApprovePayouts();
    expect(await approvedAt(t.id)).toBeNull();
  });

  it("leaves a payout above the limit for staff, with a note, and does not re-check it", async () => {
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: { payoutAutoApproveMaxKobo: 10_000 } });
    const { t } = await paidTournament();
    const result = await autoApprovePayouts();
    expect(result.heldForStaff).toBeGreaterThanOrEqual(1);
    const row = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.payoutApprovedAt).toBeNull();
    expect(row.payoutApprovalNote).toMatch(/staff review/);
    expect((await autoApprovePayouts()).heldForStaff).toBe(0);
  });

  it("does not approve a funds-frozen tournament, or anything when switched off", async () => {
    const frozen = await paidTournament({ fundsFrozen: true });
    await autoApprovePayouts();
    expect(await approvedAt(frozen.t.id)).toBeNull();

    await prisma.platformSetting.update({ where: { id: "singleton" }, data: { payoutAutoApprove: false } });
    const off = await paidTournament();
    expect((await autoApprovePayouts()).approved).toBe(0);
    expect(await approvedAt(off.t.id)).toBeNull();
  });

  it("does not approve a prize it cannot attribute to winners", async () => {
    const { t } = await paidTournament({ prizeAmount: 50_000 }); // no results, so no winners
    await autoApprovePayouts();
    expect(await approvedAt(t.id)).toBeNull();
  });
});

describe("approveTournamentPayout", () => {
  it("approves once: a second approval is refused and sends no second alert", async () => {
    const { organizer, t } = await paidTournament();
    expect((await approveTournamentPayout({ tournamentId: t.id, actorId: null })).ok).toBe(true);
    const again = await approveTournamentPayout({ tournamentId: t.id, actorId: null });
    expect(again).toMatchObject({ ok: false, status: 409 });
    expect(await prisma.notification.count({ where: { userId: organizer.id, type: "ORGANIZER_PAYOUT_APPROVED" } })).toBe(1);
  });

  it("alerts the winner with the amount they can claim and when", async () => {
    const organizer = await createTestOrganizer();
    const winner = await createTestUser();
    const runnerUp = await createTestUser();
    const t = await createTestTournament(organizer.id, { status: "COMPLETE", completedAt: PAST(), entryFee: 100_000, prizeAmount: 50_000 });
    await prisma.escrowTransaction.createMany({
      data: [
        { tournamentId: t.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 95_000, status: "PENDING" },
        { tournamentId: t.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 95_000, status: "PENDING" },
      ],
    });
    await prisma.match.create({ data: { tournamentId: t.id, round: 1, playerAId: winner.id, playerBId: runnerUp.id, status: "COMPLETE", winnerId: winner.id, matchCode: `TEST-${Date.now()}` } });

    expect((await approveTournamentPayout({ tournamentId: t.id, actorId: organizer.id })).ok).toBe(true);
    const alerts = await prisma.notification.findMany({ where: { userId: winner.id, type: "PAYOUT_APPROVED" } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].payload).toMatchObject({ tournamentId: t.id, amount: 50_000 });
    expect(new Date((alerts[0].payload as { claimFrom: string }).claimFrom).getTime()).toBeLessThan(Date.now()); // finished 48h ago: claimable now
    expect(await prisma.notification.count({ where: { userId: runnerUp.id, type: "PAYOUT_APPROVED" } })).toBe(0); // paid places only
  });
});

describe("approval notifications", () => {
  it("tell a winner when their prize can be claimed", () => {
    const later = new Date(Date.now() + 5 * 3600_000).toISOString();
    expect(formatNotification("PAYOUT_APPROVED", { tournamentId: "t1", tournamentName: "Lagos Cup", amount: 500_000, claimFrom: later }).message).toMatch(/Lagos Cup.*approved.*claim it from/);
    const now = new Date(Date.now() - 1000).toISOString();
    const ready = formatNotification("PAYOUT_APPROVED", { tournamentId: "t1", tournamentName: "Lagos Cup", amount: 500_000, claimFrom: now });
    expect(ready.message).toMatch(/claim it now/);
    expect(ready.href).toBe("/tournaments/t1");
  });
});
