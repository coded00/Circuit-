import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupAll, createTestOrganizer, createTestTournament } from "@/testHelpers";
import { PATCH } from "./route";

/**
 * The prize ceiling, at the door that edits a tournament.
 *
 * This is the second of the two doors the audit's finding #3 bypass lived behind: the create route
 * skipped the entry-fee cap for staff, and so did this one — a staff organizer who could not declare
 * an oversized prize on create could simply create a small one and edit the prize up afterwards. Both
 * routes now call the same helper (src/lib/prizePool.ts), and this file is the half of the proof that
 * the helper is actually reached from here. The helper's own unit tests cannot see that.
 *
 * Edits are also where the ceiling is not just a declaration-time nicety: the check in
 * payoutReview.ts re-applies it when the money is about to move, because a ceiling can be lowered
 * after a prize was declared under a looser one.
 */

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(), suspendedResponse: vi.fn(() => null) }));

const { getCurrentUser } = await import("@/lib/session");

const CEILING = 500_000_000; // ₦5,000,000, the schema default

let original: { maxSponsoredPrizeKobo: number; platformFeeBps: number } | null = null;

beforeEach(async () => {
  original = await prisma.platformSetting.findUnique({
    where: { id: "singleton" },
    select: { maxSponsoredPrizeKobo: true, platformFeeBps: true },
  });
  await prisma.platformSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", maxSponsoredPrizeKobo: CEILING },
    update: { maxSponsoredPrizeKobo: CEILING },
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (original) {
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: original });
  } else {
    await prisma.platformSetting.deleteMany({ where: { id: "singleton" } });
  }
  await cleanupAll();
});

function asUser(user: unknown) {
  vi.mocked(getCurrentUser).mockResolvedValue(user as never);
}

function patch(id: string, payload: unknown) {
  return PATCH(new Request(`http://localhost/api/tournaments/${id}`, { method: "PATCH", body: JSON.stringify(payload) }), {
    params: Promise.resolve({ id }),
  });
}

describe("the sponsored-prize ceiling, on edit", () => {
  it("refuses a staff organizer raising the prize above the ceiling", async () => {
    const staff = await createTestOrganizer({ isStaff: true });
    asUser(staff);
    const tournament = await createTestTournament(staff.id, { prizeAmount: 0, entryFee: 0 });

    const response = await patch(tournament.id, { prizeAmount: CEILING + 1 });

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/sponsored prize can't be more than/i);
    // The refusal has to leave the row alone, not just answer 400.
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } })).prizeAmount).toBe(0);
  });

  it("allows raising the prize exactly to the ceiling", async () => {
    // The guard test: editing a sponsored prize up to the bound is the legitimate case this whole
    // exemption exists for, and a check that refuses it too would be a worse bug than the one it fixes.
    const staff = await createTestOrganizer({ isStaff: true });
    asUser(staff);
    const tournament = await createTestTournament(staff.id, { prizeAmount: 0, entryFee: 0 });

    const response = await patch(tournament.id, { prizeAmount: CEILING });

    expect(response.status).toBe(200);
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } })).prizeAmount).toBe(CEILING);
  });

  it("reads the ceiling from the setting rather than a constant", async () => {
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: { maxSponsoredPrizeKobo: 100_000 } });
    const staff = await createTestOrganizer({ isStaff: true });
    asUser(staff);
    const tournament = await createTestTournament(staff.id, { prizeAmount: 0, entryFee: 0 });

    const response = await patch(tournament.id, { prizeAmount: 200_000 });

    expect(response.status).toBe(400);
  });

  it("still holds an ordinary organizer to the entry fees rather than the sponsored ceiling", async () => {
    // A non-staff organizer is bounded by what the tournament could collect — for a free one, that is
    // no cash prize at all. The sponsored ceiling is far looser, so if the two rules had collapsed this
    // would pass and a free tournament could promise ₦1,000.
    const organizer = await createTestOrganizer();
    asUser(organizer);
    const tournament = await createTestTournament(organizer.id, { prizeAmount: 0, entryFee: 0 });

    const response = await patch(tournament.id, { prizeAmount: 1_000 });

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/free tournament/);
  });

  it("refuses someone who is neither the organizer nor staff", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await createTestTournament(organizer.id, { prizeAmount: 0, entryFee: 0 });
    const stranger = await createTestOrganizer();
    asUser(stranger);

    const response = await patch(tournament.id, { prizeAmount: CEILING + 1 });

    expect(response.status).toBe(403);
  });
});
