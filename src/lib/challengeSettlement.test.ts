import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { approveChallengePayout, loadStandings, settleChallenge, settleReadyChallenges } from "@/lib/challengeSettlement";
import { advanceDailyChallenges } from "@/lib/dailyChallengeEntries";
import { cleanupAll, createTestCompetition, createTestStaff, createTestUser } from "@/testHelpers";

/**
 * Settlement against a real database. Rows are built directly in the state review leaves them in (verified submissions,
 * the fees in the ledger) so these tests are about the money: that each prize is paid once however many times settlement
 * runs, that the house books exactly what was not awarded, that a refund policy refunds and a keep policy keeps, that the
 * books balance to the kobo, and that the database itself won't let a payment record be rewritten.
 */

vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 });

const HOUR = 3_600_000;
const NAIRA = 100;
// ₦10,000 a head, so five players fund the worked example's ₦15,000 prize without building a hundred rows on a remote database.
const FEE = 10_000 * NAIRA;

let saved: Record<string, unknown> | null = null;
beforeAll(async () => {
  const s = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  saved = s ? { dailyChallengesEnabled: s.dailyChallengesEnabled, payoutAutoApprove: s.payoutAutoApprove, payoutAutoApproveMaxKobo: s.payoutAutoApproveMaxKobo } : null;
  await prisma.platformSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", dailyChallengesEnabled: true, payoutAutoApprove: true, payoutAutoApproveMaxKobo: 50_000_000 },
    update: { dailyChallengesEnabled: true, payoutAutoApprove: true, payoutAutoApproveMaxKobo: 50_000_000 },
  });
});
afterAll(async () => {
  if (saved) await prisma.platformSetting.update({ where: { id: "singleton" }, data: saved });
});
afterEach(cleanupAll);

type PlayerSpec = { score: number; ak?: number; win?: boolean; entryStatus?: "VERIFIED" | "REJECTED" | "DISQUALIFIED" };

/**
 * A FINALIZED challenge in the example's shape — Champion (needs a win), Kill Leader (most AK-47 kills), and the combined
 * AK-47 Champion — with one verified submission per player and each player's fee in the ledger.
 */
async function finalized(players: PlayerSpec[], over: Record<string, unknown> = {}, mode: "categories" | "split" = "categories") {
  const staff = await createTestStaff();
  const { gameId } = await createTestCompetition();
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  const now = Date.now();
  const challenge = await prisma.dailyChallenge.create({
    data: {
      gameId,
      gameName: game.name,
      title: "TEST settlement",
      rules: "r",
      evidenceRequirements: "e",
      metricLabel: "Kills",
      kind: "WEAPON",
      weaponLabel: "AK-47",
      requireRecording: true,
      entryFee: FEE,
      minEntrants: 1,
      maxEntrants: 100,
      platformFeeBps: mode === "split" ? 500 : 0,
      prizeSplit: mode === "split" ? [60, 40] : [],
      status: "DRAFT",
      entryOpensAt: new Date(now - 6 * HOUR),
      entryClosesAt: new Date(now - 5 * HOUR),
      windowStartsAt: new Date(now - 5 * HOUR),
      windowEndsAt: new Date(now - 4 * HOUR),
      submissionsCloseAt: new Date(now - 3 * HOUR),
      createdById: staff.id,
      requirements: {
        create: [
          { id: `win-${now}`, kind: "CONDITION", label: "Win the match", gate: false, sortOrder: 0 },
          { id: `ak-${now}`, kind: "TARGET", label: "AK-47 kills", threshold: 1, direction: "HIGHER", gate: true, needsRecording: true, sortOrder: 1 },
        ],
      },
      ...over,
    },
  });
  const winId = `win-${now}`;
  const akId = `ak-${now}`;
  if (mode === "categories") {
    const champ = await prisma.dailyChallengePrizeCategory.create({ data: { challengeId: challenge.id, name: "Champion", amountKobo: 5_000 * NAIRA, requiresRequirementIds: [winId], sortOrder: 0 } });
    const lead = await prisma.dailyChallengePrizeCategory.create({ data: { challengeId: challenge.id, name: "Kill Leader", amountKobo: 5_000 * NAIRA, metricRequirementId: akId, sortOrder: 1 } });
    await prisma.dailyChallengePrizeCategory.create({ data: { challengeId: challenge.id, name: "AK-47 Champion", amountKobo: 15_000 * NAIRA, comboOfCategoryIds: [champ.id, lead.id], sortOrder: 2 } });
  }
  await prisma.dailyChallenge.update({ where: { id: challenge.id }, data: { status: "FINALIZED", provisionalAt: new Date(now - 2 * HOUR), finalizedAt: new Date(now - HOUR) } });

  const users = [];
  for (const spec of players) {
    const user = await createTestUser({ walletBalance: 0, dateOfBirth: new Date("1995-01-01") });
    const status = spec.entryStatus ?? "VERIFIED";
    const entry = await prisma.dailyChallengeEntry.create({ data: { challengeId: challenge.id, userId: user.id, inGameName: "x", status } });
    const verified = status === "VERIFIED";
    const sub = await prisma.dailyChallengeSubmission.create({
      data: {
        entryId: entry.id,
        score: spec.score,
        evidenceRef: "ref",
        evidenceMime: "image/png",
        evidenceHash: `h-${entry.id}`,
        status: verified ? "VERIFIED" : "REJECTED",
        verifiedScore: verified ? spec.score : null,
        reviewedAt: new Date(),
      },
    });
    await prisma.dailyChallengeRequirementResult.createMany({
      data: [
        { submissionId: sub.id, requirementId: winId, claimedMet: !!spec.win, met: verified ? !!spec.win : null },
        { submissionId: sub.id, requirementId: akId, claimedValue: spec.ak ?? 0, met: verified ? true : null, verifiedValue: verified ? (spec.ak ?? 0) : null },
      ],
    });
    // Their fee, as entering would have written it.
    await prisma.escrowTransaction.create({ data: { dailyChallengeId: challenge.id, dailyChallengeEntryId: entry.id, userId: user.id, type: "CHALLENGE_ENTRY", amount: FEE, status: "COMPLETE" } });
    if (mode === "split") {
      await prisma.escrowTransaction.create({ data: { dailyChallengeId: challenge.id, dailyChallengeEntryId: entry.id, type: "CHALLENGE_PLATFORM_FEE", amount: FEE / 20, status: "COMPLETE" } });
    }
    users.push(user);
  }
  return { challenge, staff, users, winId, akId };
}

const wallet = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id }, select: { walletBalance: true } })).walletBalance;
const rows = (id: string, type: string) => prisma.escrowTransaction.findMany({ where: { dailyChallengeId: id, type: type as never } });
const total = (xs: { amount: number }[]) => xs.reduce((s, r) => s + r.amount, 0);

describe("settling the worked example", () => {
  const field: PlayerSpec[] = [
    { score: 14, ak: 12, win: true }, // wins the match and leads on AK-47 kills: the combined prize
    { score: 9, ak: 8, win: false },
    { score: 7, ak: 3, win: true },
    { score: 5, ak: 1, win: false },
    { score: 4, ak: 1, win: false },
  ];

  it("pays the combined prize once, books the rest to the house, and the books balance to the kobo", async () => {
    const { challenge, users } = await finalized(field);
    const r = await settleChallenge({ challengeId: challenge.id });
    expect(r).toMatchObject({ status: "SETTLED", awarded: 15_000 * NAIRA, house: 35_000 * NAIRA });

    expect(await wallet(users[0].id)).toBe(15_000 * NAIRA);
    for (const u of users.slice(1)) expect(await wallet(u.id)).toBe(0);

    const awards = await prisma.dailyChallengePrizeAward.findMany({ where: { challengeId: challenge.id } });
    expect(awards).toHaveLength(1);
    expect(awards[0]).toMatchObject({ categoryName: "AK-47 Champion", userId: users[0].id, amountKobo: 15_000 * NAIRA });

    // The ledger: fees in, prize out, the remainder to the house.
    const prizeRows = await rows(challenge.id, "CHALLENGE_PRIZE");
    const house = await rows(challenge.id, "CHALLENGE_HOUSE_REVENUE");
    expect(total(prizeRows)).toBe(15_000 * NAIRA);
    expect(total(house)).toBe(35_000 * NAIRA);
    expect(total(await rows(challenge.id, "CHALLENGE_ENTRY"))).toBe(total(prizeRows) + total(house));
    expect(await prisma.walletTransaction.count({ where: { userId: users[0].id, type: "CHALLENGE_PRIZE_CREDIT", amount: 15_000 * NAIRA } })).toBe(1);

    const done = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
    expect(done).toMatchObject({ status: "COMPLETED", collectedKobo: 50_000 * NAIRA, awardedKobo: 15_000 * NAIRA, houseKobo: 35_000 * NAIRA });
    expect(done.settledAt).not.toBeNull();
    expect(await prisma.notification.count({ where: { userId: users[0].id, type: "DAILY_CHALLENGE_PRIZE" } })).toBe(1);
  });

  it("pays the two separate prizes when different players win them, and books the combined prize's money to the house", async () => {
    const { challenge, users } = await finalized([
      { score: 14, ak: 3, win: true }, // wins the match
      { score: 9, ak: 8, win: false }, // leads on AK-47 kills
      { score: 4, ak: 1, win: false },
    ]);
    const r = await settleChallenge({ challengeId: challenge.id });
    expect(r).toMatchObject({ status: "SETTLED", awarded: 10_000 * NAIRA, house: 20_000 * NAIRA });
    expect(await wallet(users[0].id)).toBe(5_000 * NAIRA);
    expect(await wallet(users[1].id)).toBe(5_000 * NAIRA);
  });

  it("pays each prize exactly once however many times settlement runs, including two at the same moment", async () => {
    const { challenge, users } = await finalized(field);
    const results = await Promise.all([settleChallenge({ challengeId: challenge.id }), settleChallenge({ challengeId: challenge.id }), settleChallenge({ challengeId: challenge.id })]);
    expect(results.filter((r) => r.status === "SETTLED")).toHaveLength(1);
    expect(await wallet(users[0].id)).toBe(15_000 * NAIRA);
    expect(await prisma.dailyChallengePrizeAward.count({ where: { challengeId: challenge.id } })).toBe(1);
    expect(await rows(challenge.id, "CHALLENGE_PRIZE")).toHaveLength(1);
    expect(await rows(challenge.id, "CHALLENGE_HOUSE_REVENUE")).toHaveLength(1);
    expect(await settleChallenge({ challengeId: challenge.id })).toEqual({ status: "ALREADY_SETTLED" });
  });

  it("pays nothing twice when a run died after paying and is retried", async () => {
    const { challenge, users } = await finalized(field);
    await settleChallenge({ challengeId: challenge.id });
    // The crash: the money moved but the challenge never got marked complete.
    await prisma.dailyChallenge.update({ where: { id: challenge.id }, data: { status: "SETTLING" } });
    const again = await settleChallenge({ challengeId: challenge.id });
    expect(again.status).toBe("SETTLED");
    expect(await wallet(users[0].id)).toBe(15_000 * NAIRA);
    expect(await rows(challenge.id, "CHALLENGE_PRIZE")).toHaveLength(1);
    expect(await rows(challenge.id, "CHALLENGE_HOUSE_REVENUE")).toHaveLength(1);
    expect((await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).status).toBe("COMPLETED");
  });

  it("refuses to settle before the standings are final", async () => {
    const { challenge } = await finalized(field);
    await prisma.dailyChallenge.update({ where: { id: challenge.id }, data: { status: "PROVISIONAL" } });
    expect(await settleChallenge({ challengeId: challenge.id })).toEqual({ status: "NOT_READY" });
    expect(await rows(challenge.id, "CHALLENGE_PRIZE")).toHaveLength(0);
  });

  it("refuses, and pays nothing, when the entries can't fund the prizes", async () => {
    const { challenge } = await finalized([{ score: 14, ak: 12, win: true }]); // one ₦10,000 entry cannot pay a ₦15,000 prize
    const r = await settleChallenge({ challengeId: challenge.id });
    expect(r).toMatchObject({ status: "FAILED", error: expect.stringContaining("Nothing has been paid") });
    expect(await prisma.dailyChallengePrizeAward.count({ where: { challengeId: challenge.id } })).toBe(0);
    expect((await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).status).toBe("FINALIZED");
  });
});

describe("when nobody qualifies", () => {
  const nobody: PlayerSpec[] = [
    { score: 3, entryStatus: "REJECTED" },
    { score: 2, entryStatus: "REJECTED" },
    { score: 1, entryStatus: "DISQUALIFIED" },
  ];

  it("lets the house keep all of it when that is the policy", async () => {
    const { challenge, users } = await finalized(nobody, { noWinnerPolicy: "HOUSE_KEEPS" });
    const r = await settleChallenge({ challengeId: challenge.id });
    expect(r).toMatchObject({ status: "SETTLED", awarded: 0, house: 30_000 * NAIRA });
    for (const u of users) expect(await wallet(u.id)).toBe(0);
    expect(total(await rows(challenge.id, "CHALLENGE_HOUSE_REVENUE"))).toBe(30_000 * NAIRA);
  });

  it("refunds every entry except a disqualified one, whose fee the house keeps, when that is the policy", async () => {
    const { challenge, users } = await finalized(nobody, { noWinnerPolicy: "REFUND_ENTRIES" });
    const r = await settleChallenge({ challengeId: challenge.id });
    expect(r).toMatchObject({ status: "SETTLED", awarded: 0, house: FEE });
    expect(await wallet(users[0].id)).toBe(FEE);
    expect(await wallet(users[1].id)).toBe(FEE);
    expect(await wallet(users[2].id)).toBe(0); // disqualified: the fee is forfeited
    expect(total(await rows(challenge.id, "CHALLENGE_REFUND"))).toBe(2 * FEE);
    // In = out: three fees in, two refunded, one kept by the house.
    expect(total(await rows(challenge.id, "CHALLENGE_ENTRY"))).toBe(total(await rows(challenge.id, "CHALLENGE_REFUND")) + total(await rows(challenge.id, "CHALLENGE_HOUSE_REVENUE")));
  });

  it("does not refund when somebody did qualify, whatever the policy says", async () => {
    const { challenge, users } = await finalized([{ score: 14, ak: 12, win: true }, { score: 9, ak: 8, win: false }, { score: 4, ak: 1, win: false }], { noWinnerPolicy: "REFUND_ENTRIES" });
    await settleChallenge({ challengeId: challenge.id });
    expect(await rows(challenge.id, "CHALLENGE_REFUND")).toHaveLength(0);
    expect(await wallet(users[0].id)).toBeGreaterThan(0);
  });
});

describe("approval", () => {
  it("waits for a named approval when a sponsor's money is involved, and refuses the creator and a winner as the approver", async () => {
    const { challenge, staff, users } = await finalized([{ score: 14, ak: 12, win: true }, { score: 9, ak: 8, win: false }, { score: 4, ak: 1, win: false }]);
    await prisma.dailyChallengeSponsorship.create({ data: { challengeId: challenge.id, amountKobo: 5_000 * NAIRA, source: "Brand budget", recordedById: staff.id } });
    expect(await settleChallenge({ challengeId: challenge.id })).toEqual({ status: "WAITING_FOR_APPROVAL" });
    expect(await rows(challenge.id, "CHALLENGE_PRIZE")).toHaveLength(0);

    expect(await approveChallengePayout({ challengeId: challenge.id, actorId: staff.id })).toMatchObject({ ok: false, status: 403, error: expect.stringContaining("created") });
    const winnerStaff = await prisma.user.update({ where: { id: users[0].id }, data: { isStaff: true } });
    expect(await approveChallengePayout({ challengeId: challenge.id, actorId: winnerStaff.id })).toMatchObject({ ok: false, status: 403, error: expect.stringContaining("pay you") });

    const approver = await createTestStaff();
    expect(await approveChallengePayout({ challengeId: challenge.id, actorId: approver.id })).toEqual({ ok: true });
    expect(await approveChallengePayout({ challengeId: challenge.id, actorId: approver.id })).toMatchObject({ ok: false, status: 409 });
    expect((await settleChallenge({ challengeId: challenge.id })).status).toBe("SETTLED");
  });

  it("waits when the prizes are over the auto-approval limit", async () => {
    const { challenge } = await finalized([{ score: 14, ak: 12, win: true }, { score: 9, ak: 8, win: false }, { score: 4, ak: 1, win: false }]);
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: { payoutAutoApproveMaxKobo: 1_000 * NAIRA } });
    try {
      expect(await settleChallenge({ challengeId: challenge.id })).toEqual({ status: "WAITING_FOR_APPROVAL" });
    } finally {
      await prisma.platformSetting.update({ where: { id: "singleton" }, data: { payoutAutoApproveMaxKobo: 50_000_000 } });
    }
  });
});

describe("the older rank split", () => {
  it("settles by rank from what the entries brought in after the platform's cut, with no house row when it is all paid", async () => {
    const { challenge, users } = await finalized([{ score: 20 }, { score: 15 }, { score: 5 }], {}, "split");
    // ₦30,000 collected, ₦1,500 booked as the platform's cut at entry: a ₦28,500 pool split 60/40.
    const r = await settleChallenge({ challengeId: challenge.id });
    expect(r).toMatchObject({ status: "SETTLED", awarded: 28_500 * NAIRA, house: 0 });
    expect(await wallet(users[0].id)).toBe(17_100 * NAIRA);
    expect(await wallet(users[1].id)).toBe(11_400 * NAIRA);
    expect(await wallet(users[2].id)).toBe(0);
    expect(await rows(challenge.id, "CHALLENGE_HOUSE_REVENUE")).toHaveLength(0);
  });
});

describe("what the database refuses", () => {
  it("won't let a payment record be edited or deleted", async () => {
    const { challenge } = await finalized([{ score: 14, ak: 12, win: true }, { score: 9, ak: 8, win: false }, { score: 4, ak: 1, win: false }, { score: 3, ak: 1, win: false }]);
    await settleChallenge({ challengeId: challenge.id });
    const award = await prisma.dailyChallengePrizeAward.findFirstOrThrow({ where: { challengeId: challenge.id } });
    await expect(prisma.dailyChallengePrizeAward.update({ where: { id: award.id }, data: { amountKobo: 999_999_999 } })).rejects.toThrow(/cannot be changed/);
    await expect(prisma.dailyChallengePrizeAward.delete({ where: { id: award.id } })).rejects.toThrow(/cannot be deleted/);
    // And the same prize cannot be written twice.
    await expect(prisma.dailyChallengePrizeAward.create({ data: { challengeId: challenge.id, categoryKey: award.categoryKey, categoryName: "x", userId: award.userId, amountKobo: 1 } })).rejects.toThrow();
  });
});

describe("standings", () => {
  it("stay hidden until staff have verified scores, then show every board with the winners marked", async () => {
    const { challenge, users } = await finalized([{ score: 14, ak: 12, win: true }, { score: 9, ak: 8, win: false }, { score: 7, ak: 3, win: true }]);
    await prisma.dailyChallenge.update({ where: { id: challenge.id }, data: { status: "UNDER_REVIEW" } });
    expect(await loadStandings(challenge.id)).toMatchObject({ visible: false, boards: null });

    await prisma.dailyChallenge.update({ where: { id: challenge.id }, data: { status: "PROVISIONAL" } });
    const standings = await loadStandings(challenge.id);
    expect(standings?.visible).toBe(true);
    expect(standings?.boards?.overall.map((r) => r.userId)).toEqual([users[0].id, users[1].id, users[2].id]);
    // Three ₦10,000 entries: the ₦15,000 combined prize is held by the first player, provisionally.
    expect(standings?.awards).toEqual([expect.objectContaining({ categoryName: "AK-47 Champion", userId: users[0].id, amount: 15_000 * NAIRA })]);
    expect(standings?.boards?.categories.find((c) => c.name === "Kill Leader")?.rows.map((r) => r.userId)).toEqual([users[0].id, users[1].id, users[2].id]);
  });
});

describe("the sweep's whole lifecycle", () => {
  it("carries a reviewed challenge from the end of the window to paid, with nobody touching it", async () => {
    const { challenge, users } = await finalized([{ score: 14, ak: 12, win: true }, { score: 9, ak: 8, win: false }, { score: 4, ak: 1, win: false }]);
    // Back up to where review leaves it: the window over and every submission decided, but not yet provisional.
    await prisma.dailyChallenge.update({ where: { id: challenge.id }, data: { status: "UNDER_REVIEW", provisionalAt: null, finalizedAt: null } });

    const t0 = new Date();
    await advanceDailyChallenges(t0, { only: [challenge.id] });
    expect((await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).status).toBe("PROVISIONAL");

    // Inside the dispute window nothing happens; once it has passed, it is final.
    await advanceDailyChallenges(new Date(t0.getTime() + 10 * 60_000), { only: [challenge.id] });
    expect((await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).status).toBe("PROVISIONAL");
    await advanceDailyChallenges(new Date(t0.getTime() + 31 * 60_000), { only: [challenge.id] });
    expect((await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).status).toBe("FINALIZED");

    const swept = await settleReadyChallenges(new Date(), { only: [challenge.id] });
    expect(swept.settled).toBe(1);
    expect((await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).status).toBe("COMPLETED");
    expect(await wallet(users[1].id)).toBeGreaterThanOrEqual(0);
  });
});
