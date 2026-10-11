import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupAll, createTestOrganizer, createTestTournament } from "@/testHelpers";
import { maxPrizePool, payableFraction, prizeFundingError, sponsoredPrizeCapError, prizeCapError } from "@/lib/prizePool";

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

/**
 * The ceiling on a sponsored prize, which is the bound the entry-fee cap's exemption never had.
 *
 * A staff-run tournament's prize is paid from Circuit's own balance, so `prizeFundingError` above does
 * not apply to it. These are the two rules side by side: which one a tournament is judged by depends
 * on whether its organizer is staff, and the point of `prizeCapError` is that both routes onto a prize
 * make that choice in one place rather than once each.
 */
describe("sponsoredPrizeCapError", () => {
  it("allows a prize up to the ceiling and refuses one kobo over", () => {
    expect(sponsoredPrizeCapError({ prizeAmount: 500_000_000, capKobo: 500_000_000 })).toBeNull();
    expect(sponsoredPrizeCapError({ prizeAmount: 500_000_001, capKobo: 500_000_000 })).toMatch(/can't be more than ₦5,000,000/);
  });

  it("allows no prize at all, and a zero ceiling refuses any prize", () => {
    // Zero is a real setting — the kill switch for sponsored cash prizes — not a nonsense value, so the
    // rule has to treat it as a bound of zero rather than as "unset".
    expect(sponsoredPrizeCapError({ prizeAmount: null, capKobo: 500_000_000 })).toBeNull();
    expect(sponsoredPrizeCapError({ prizeAmount: 0, capKobo: 500_000_000 })).toBeNull();
    expect(sponsoredPrizeCapError({ prizeAmount: 1, capKobo: 0 })).toMatch(/₦0/);
  });
});

describe("prizeCapError", () => {
  const CEILING = 500_000_000;
  let original: { maxSponsoredPrizeKobo: number; platformFeeBps: number } | null = null;

  beforeEach(async () => {
    original = await prisma.platformSetting.findUnique({
      where: { id: "singleton" },
      select: { maxSponsoredPrizeKobo: true, platformFeeBps: true },
    });
    await prisma.platformSetting.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", maxSponsoredPrizeKobo: CEILING, platformFeeBps: 0 },
      update: { maxSponsoredPrizeKobo: CEILING, platformFeeBps: 0 },
    });
  });

  afterEach(async () => {
    // Upsert rather than update: one of these tests deletes the row on purpose, and restoring has to
    // work whether it survived or not — an afterEach that throws its own error hides the real result.
    if (original) {
      await prisma.platformSetting.upsert({ where: { id: "singleton" }, create: { id: "singleton", ...original }, update: original });
    } else {
      await prisma.platformSetting.deleteMany({ where: { id: "singleton" } });
    }
  });

  it("judges a sponsored tournament by the ceiling, not by the entry fees", async () => {
    // A free tournament could never fund a cash prize from entry fees, so the two rules give opposite
    // answers here — which is what makes this a test of which one is being applied.
    const opts = { prizeAmount: 1_000_000, entryFee: 0, participantCap: 8 };

    expect(await prizeCapError({ ...opts, sponsored: false })).toMatch(/free tournament/);
    expect(await prizeCapError({ ...opts, sponsored: true })).toBeNull();
  });

  it("judges an ordinary tournament by the entry fees, however small the ceiling is set", async () => {
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: { maxSponsoredPrizeKobo: 0 } });

    const ordinary = await prizeCapError({ prizeAmount: 1, entryFee: 0, participantCap: 8, sponsored: false });

    expect(ordinary).toMatch(/free tournament/);
  });

  it("reads the ceiling fresh, so lowering it applies to the next prize", async () => {
    const opts = { prizeAmount: 1_000, entryFee: 0, participantCap: 8, sponsored: true };
    expect(await prizeCapError(opts)).toBeNull();

    await prisma.platformSetting.update({ where: { id: "singleton" }, data: { maxSponsoredPrizeKobo: 100 } });

    expect(await prizeCapError(opts)).toMatch(/₦1/);
  });

  it("falls back to the schema default when there is no setting row", async () => {
    await prisma.platformSetting.deleteMany({ where: { id: "singleton" } });

    // 500,000,000 is DEFAULT_MAX_SPONSORED_PRIZE_KOBO; if the fallback and the column default ever drift
    // apart, a deployment missing its settings row would silently enforce a different bound.
    const setting = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
    expect(setting).toBeNull();
    expect(await prizeCapError({ prizeAmount: 500_000_000, entryFee: 0, participantCap: 8, sponsored: true })).toBeNull();
    expect(await prizeCapError({ prizeAmount: 500_000_001, entryFee: 0, participantCap: 8, sponsored: true })).toMatch(/₦5,000,000/);
  });
});
