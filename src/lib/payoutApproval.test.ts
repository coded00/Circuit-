import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupAll, createTestOrganizer, createTestStaff, createTestTournament, createTestUser, uniqueSuffix } from "@/testHelpers";
import { approveTournamentPayout, autoApprovePayouts } from "@/lib/payoutApproval";
import { reviewTournamentPayout } from "@/lib/payoutReview";
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
    // A staff member who is neither the organizer nor a winner — the only kind of actor who can approve at
    // all now (see the separation-of-duties checks in approveTournamentPayout, and the describe block below).
    const staff = await createTestStaff();
    const t = await createTestTournament(organizer.id, { status: "COMPLETE", completedAt: PAST(), entryFee: 100_000, prizeAmount: 50_000 });
    await prisma.escrowTransaction.createMany({
      data: [
        { tournamentId: t.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 95_000, status: "PENDING" },
        { tournamentId: t.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 95_000, status: "PENDING" },
      ],
    });
    await prisma.match.create({ data: { tournamentId: t.id, round: 1, playerAId: winner.id, playerBId: runnerUp.id, status: "COMPLETE", winnerId: winner.id, matchCode: `TEST-${Date.now()}` } });

    expect((await approveTournamentPayout({ tournamentId: t.id, actorId: staff.id })).ok).toBe(true);
    const alerts = await prisma.notification.findMany({ where: { userId: winner.id, type: "PAYOUT_APPROVED" } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].payload).toMatchObject({ tournamentId: t.id, amount: 50_000 });
    expect(new Date((alerts[0].payload as { claimFrom: string }).claimFrom).getTime()).toBeLessThan(Date.now()); // finished 48h ago: claimable now
    expect(await prisma.notification.count({ where: { userId: runnerUp.id, type: "PAYOUT_APPROVED" } })).toBe(0); // paid places only
  });
});

/**
 * A staff-run (sponsored) tournament pays a prize the entry fees never covered — approving it spends
 * Circuit's own balance. These tests are about who is allowed to do that, and about the one thing that must
 * never happen: the system doing it on its own.
 */
async function sponsoredTournament(over: { entryFee?: number; prizeAmount?: number; collected?: number; championIsStaff?: boolean } = {}) {
  const organizer = await createTestOrganizer({ isStaff: true });
  const champion = over.championIsStaff ? await createTestStaff() : await createTestUser();
  const runnerUp = await createTestUser();
  const t = await createTestTournament(organizer.id, {
    status: "COMPLETE",
    completedAt: PAST(),
    entryFee: over.entryFee ?? 0,
    prizeAmount: over.prizeAmount ?? 50_000,
    participantCap: 8,
  });
  await prisma.match.create({
    data: { tournamentId: t.id, round: 1, playerAId: champion.id, playerBId: runnerUp.id, status: "COMPLETE", winnerId: champion.id, matchCode: `TEST-${uniqueSuffix()}` },
  });
  if (over.collected) {
    await prisma.escrowTransaction.create({ data: { tournamentId: t.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: over.collected, status: "PENDING" } });
  }
  return { organizer, champion, runnerUp, t };
}

describe("who may approve a sponsored payout", () => {
  it("refuses the organizer approving their own tournament, and approves nothing", async () => {
    const { organizer, t } = await sponsoredTournament();
    expect(await approveTournamentPayout({ tournamentId: t.id, actorId: organizer.id })).toMatchObject({ ok: false, status: 403 });
    expect(await approvedAt(t.id)).toBeNull();
  });

  it("refuses a staff member who is in a prize place themselves", async () => {
    const { champion, t } = await sponsoredTournament({ championIsStaff: true });
    expect(await approveTournamentPayout({ tournamentId: t.id, actorId: champion.id })).toMatchObject({ ok: false, status: 403 });
    expect(await approvedAt(t.id)).toBeNull();
  });

  it("lets a staff member who is neither approve it, and records the organizer alongside the amount", async () => {
    const staff = await createTestStaff();
    const { organizer, t } = await sponsoredTournament();
    expect((await approveTournamentPayout({ tournamentId: t.id, actorId: staff.id })).ok).toBe(true);

    const row = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.payoutApprovedById).toBe(staff.id);
    // The audit row is what ties a human to platform money leaving — so it has to name both ends of the
    // separation-of-duties check, not just the approver.
    const log = await prisma.auditLogEntry.findFirst({ where: { actorId: staff.id, action: "tournament.approvePayout", targetId: t.id } });
    expect(log?.metadata).toMatchObject({ organizerId: organizer.id, sponsored: true, unbackedAmount: 50_000 });
  });

  it("refuses a system approval of an unbacked payout even when called directly", async () => {
    // The sweep has its own guard (below); this is the one on the door itself, so a future caller that
    // forgets cannot release platform money with nobody's name on it.
    const { t } = await sponsoredTournament();
    expect(await approveTournamentPayout({ tournamentId: t.id, actorId: null })).toMatchObject({ ok: false, status: 409 });
    expect(await approvedAt(t.id)).toBeNull();
  });

  it("never approves one automatically — it is held for staff, with the reason, once", async () => {
    const { t } = await sponsoredTournament();
    const result = await autoApprovePayouts();
    expect(result.heldForStaff).toBeGreaterThanOrEqual(1);

    const row = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.payoutApprovedAt).toBeNull();
    expect(row.payoutApprovedById).toBeNull();
    expect(row.payoutApprovalNote).toMatch(/covered by the entry fees/);
    // The note is also what stops the sweep re-deciding it on every run.
    expect((await autoApprovePayouts()).heldForStaff).toBe(0);
    // And nothing was released: the prize place was never told they could claim, and no money moved.
    expect(await prisma.notification.count({ where: { type: "PAYOUT_APPROVED", payload: { path: ["tournamentId"], equals: t.id } } })).toBe(0);
    expect(await prisma.escrowTransaction.count({ where: { tournamentId: t.id, type: "PRIZE_PAYOUT" } })).toBe(0);
  });

  it("still approves automatically when a tournament's own entry fees covered its prize", async () => {
    // The guard must not catch the ordinary case: a non-staff organizer whose tournament collected more than
    // its prize. None of this money is Circuit's.
    //
    // Both a single winner and a split across places, because the split is where the arithmetic could go the
    // other way: shares are floored and the remainder is clamped in prizeShares (src/lib/prizes.ts), so they
    // can only ever sum to less than the declared prize, never more — which is what makes unbackedAmount
    // genuinely 0 here rather than approximately. If that ever stopped holding, ordinary payouts would
    // silently stop being auto-approved and every one would wait for staff.
    for (const prizeSplit of [[], [60, 40]]) {
      const organizer = await createTestOrganizer();
      const champion = await createTestUser();
      const runnerUp = await createTestUser();
      const t = await createTestTournament(organizer.id, { status: "COMPLETE", completedAt: PAST(), entryFee: 100_000, prizeAmount: 50_000, prizeSplit });
      await prisma.escrowTransaction.createMany({
        data: [
          { tournamentId: t.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 95_000, status: "PENDING" },
          { tournamentId: t.id, userId: organizer.id, type: "ORGANIZER_REVENUE", amount: 95_000, status: "PENDING" },
        ],
      });
      await prisma.match.create({
        data: { tournamentId: t.id, round: 1, playerAId: champion.id, playerBId: runnerUp.id, status: "COMPLETE", winnerId: champion.id, matchCode: `TEST-${uniqueSuffix()}` },
      });

      const review = await reviewTournamentPayout(await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } }));
      // Checked, not assumed: the second iteration only means anything if the split really did produce two
      // shares to add up (a knockout's final gives a champion and a runner-up).
      expect(review.shares).toHaveLength(prizeSplit.length ? 2 : 1);
      expect(review.payablePrize).toBe(50_000); // the whole declared prize, still within what was collected
      expect(review.unbackedAmount).toBe(0);
      await autoApprovePayouts();
      expect(await approvedAt(t.id)).not.toBeNull();
    }
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
