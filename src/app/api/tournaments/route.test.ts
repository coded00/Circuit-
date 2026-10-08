import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupAll, createTestCompetition, createTestStaff, createTestUser } from "@/testHelpers";
import { POST } from "./route";

/**
 * The prize ceiling, at the door that creates a tournament.
 *
 * Finding #3 of the security audit: a staff-run tournament is *sponsored*, so the rule that a prize
 * can't exceed the entry fees is skipped for it — and nothing was put in its place. A staff organizer
 * could declare any prize at all, collect nothing, and have it paid from Circuit's own balance.
 *
 * The bypass had two doors: this route and PATCH /api/tournaments/[id]. Both now call the same helper
 * (src/lib/prizePool.ts), and this file plus the edit route's own test are what hold that: the helper's
 * unit tests would stay green if a route stopped calling it, which is exactly the failure mode that let
 * this sit in two places to begin with.
 *
 * The refusal is the point of these tests, so they assert the 400 rather than only the rule.
 */

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(), suspendedResponse: vi.fn(() => null) }));

// The route defers its "new tournament" fan-out through after(), which needs a request scope Vitest
// does not provide. Stubbed rather than worked around: what these tests are about is whether the prize
// is allowed, and the notification batch is downstream of a tournament that only exists if it was.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

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

/** A body that gets past everything the route checks before the prize rule. */
function body(competition: { gameId: string; gameModeId: string; gameFormatId: string }, prizeAmount: number) {
  return {
    name: "TEST-Prize cap tournament",
    rulesText: "Be on time.",
    ...competition,
    structure: "KNOCKOUT",
    participantCap: 8,
    entryFee: 0,
    prizeAmount,
    registrationOpenAt: new Date(Date.now() - 3_600_000).toISOString(),
    registrationCloseAt: new Date(Date.now() + 3_600_000).toISOString(),
    startAt: new Date(Date.now() + 7_200_000).toISOString(),
    enableCommunity: false,
  };
}

function post(payload: unknown) {
  return POST(new Request("http://localhost/api/tournaments", { method: "POST", body: JSON.stringify(payload) }));
}

describe("the sponsored-prize ceiling, on create", () => {
  it("refuses a staff organizer a prize above the ceiling", async () => {
    const staff = await createTestStaff();
    asUser(staff);
    const competition = await createTestCompetition();

    const response = await post(body(competition, CEILING + 1));

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/sponsored prize can't be more than/i);
    // Nothing was created — a refusal that still leaves the tournament behind is not a refusal.
    expect(await prisma.tournament.count({ where: { name: "TEST-Prize cap tournament" } })).toBe(0);
  });

  it("refuses at the ceiling the knob actually says, not a hardcoded one", async () => {
    // The proof that the route reads the setting rather than a constant that happens to match the
    // default. A prize that is legal under the default is refused once the ceiling is lowered under it.
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: { maxSponsoredPrizeKobo: 100_000 } });
    const staff = await createTestStaff();
    asUser(staff);
    const competition = await createTestCompetition();

    const response = await post(body(competition, 200_000));

    expect(response.status).toBe(400);
  });

  it("still holds an ordinary organizer to the entry fees, not the sponsored ceiling", async () => {
    // The two rules must not have collapsed into one another: an ordinary organizer's prize is still
    // bounded by what the entry fees could collect, which for a free tournament means no cash prize at
    // all — a far tighter bound than the sponsored ceiling, and it has to stay that way.
    const organizer = await createTestUser();
    asUser(organizer);
    const competition = await createTestCompetition();

    const response = await post(body(competition, 1_000));

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/free tournament/);
  });

  it("lets a staff organizer declare a prize exactly at the ceiling", async () => {
    // The guard test: a bound that refuses everything is not a bound, and the whole point of the
    // exemption is that a real sponsored event still works.
    const staff = await createTestStaff();
    asUser(staff);
    const competition = await createTestCompetition();

    const response = await post(body(competition, CEILING));

    expect(response.status).not.toBe(400);
    expect(await prisma.tournament.count({ where: { name: "TEST-Prize cap tournament" } })).toBe(1);
  });

  it("refuses an unauthenticated caller before any of this", async () => {
    asUser(null);
    const competition = await createTestCompetition();

    const response = await post(body(competition, CEILING + 1));

    expect(response.status).toBe(401);
  });
});
