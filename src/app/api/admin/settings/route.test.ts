import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cleanupAll, createTestStaff } from "@/testHelpers";
import { PATCH } from "./route";

/**
 * The validation on platform settings. This file exists for two reasons.
 *
 * The first is the repeated-pair thresholds added alongside the collusion
 * sweep (src/lib/stakePatterns.ts) — four new numbers a super admin types,
 * each with a bound that has to be a real one, because a threshold that can
 * be set to something meaningless is a detection rule that silently stops
 * detecting.
 *
 * The second is a bug this file's own first draft found. The kobo ceilings
 * were 100,000,000,000, which is not a value a Prisma `Int` column can hold
 * (PostgreSQL INT4 tops out at 2,147,483,647) — so the one thing this route
 * is for, refusing a bad number, turned into a Prisma conversion error and a
 * 500. The ceiling tests below are the regression proof.
 */

vi.mock("@/lib/session", () => ({ requireSuperAdmin: vi.fn() }));

const { requireSuperAdmin } = await import("@/lib/session");

let original: Record<string, unknown> | null = null;

beforeEach(async () => {
  original = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  // Several tests read the row back to prove a refusal left it alone, which needs it to exist before the
  // first PATCH. It is the upsert in the route that normally creates it, so a test file that only ever
  // reads would depend on a row left behind by something else — which is exactly the order-dependence
  // these assertions are meant to rule out. `original` still records whether it was there, so afterEach
  // restores "absent" as absent rather than inventing a row.
  if (!original) await prisma.platformSetting.create({ data: { id: "singleton" } });
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (original) {
    const { id: _id, ...rest } = original;
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: rest });
  } else {
    await prisma.platformSetting.deleteMany({ where: { id: "singleton" } });
  }
  await cleanupAll();
});

async function asSuperAdmin() {
  const admin = await createTestStaff({ adminRole: "SUPER_ADMIN" });
  vi.mocked(requireSuperAdmin).mockResolvedValue({ user: admin, error: null } as never);
  return admin;
}

function patch(body: unknown) {
  return PATCH(new Request("http://localhost/api/admin/settings", { method: "PATCH", body: JSON.stringify(body) }));
}

function asNobody() {
  vi.mocked(requireSuperAdmin).mockResolvedValue({
    user: null,
    error: NextResponse.json({ error: "Only a Super Admin can change platform settings." }, { status: 403 }),
  } as never);
}

const settings = () => prisma.platformSetting.findUniqueOrThrow({ where: { id: "singleton" } });

describe("stake-pattern thresholds", () => {
  it("saves all four and records one audit entry per field changed", async () => {
    const admin = await asSuperAdmin();

    const response = await patch({
      stakePatternWindowDays: 30,
      stakePatternMinBattles: 8,
      stakePatternWinShareBps: 9000,
      stakePatternNetAlertKobo: 25_000_000,
    });

    expect(response.status).toBe(200);
    expect(await settings()).toMatchObject({
      stakePatternWindowDays: 30,
      stakePatternMinBattles: 8,
      stakePatternWinShareBps: 9000,
      stakePatternNetAlertKobo: 25_000_000,
    });
    const actions = await prisma.auditLogEntry.findMany({ where: { actorId: admin.id } });
    expect(actions.map((a) => a.action).sort()).toEqual([
      "settings.stakePatternMinBattlesChange",
      "settings.stakePatternNetAlertChange",
      "settings.stakePatternWinShareChange",
      "settings.stakePatternWindowChange",
    ]);
  });

  it("allows a zero-day lookback, which is how detection is switched off", async () => {
    await asSuperAdmin();

    const response = await patch({ stakePatternWindowDays: 0 });

    expect(response.status).toBe(200);
    expect((await settings()).stakePatternWindowDays).toBe(0);
  });

  it("refuses a sample floor below two, which would judge a pair on one Battle", async () => {
    // A "pattern" between two accounts cannot be read off a single result.
    await asSuperAdmin();
    const before = await settings();

    for (const min of [0, 1, -3, 2.5]) {
      const response = await patch({ stakePatternMinBattles: min });
      expect(response.status).toBe(400);
    }
    expect((await settings()).stakePatternMinBattles).toBe(before.stakePatternMinBattles);
  });

  it("refuses a win share below an even split", async () => {
    // Under 50% would flag every pair that has ever played twice, and the
    // message says which way the bound runs rather than just "invalid".
    await asSuperAdmin();

    const response = await patch({ stakePatternWinShareBps: 4000 });

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/50/);
  });

  it("refuses a net threshold that is not whole naira", async () => {
    await asSuperAdmin();

    const response = await patch({ stakePatternNetAlertKobo: 1_234 });

    expect(response.status).toBe(400);
  });

  it("refuses a non-staff caller", async () => {
    asNobody();
    const before = await settings();

    const response = await patch({ stakePatternMinBattles: 9 });

    expect(response.status).toBe(403);
    expect((await settings()).stakePatternMinBattles).toBe(before.stakePatternMinBattles);
  });
});

describe("the sponsored-prize ceiling", () => {
  it("saves it and records the audit entry", async () => {
    const admin = await asSuperAdmin();

    const response = await patch({ maxSponsoredPrizeKobo: 1_000_000_000 });

    expect(response.status).toBe(200);
    expect((await settings()).maxSponsoredPrizeKobo).toBe(1_000_000_000);
    const actions = await prisma.auditLogEntry.findMany({ where: { actorId: admin.id } });
    expect(actions.map((a) => a.action)).toEqual(["settings.maxSponsoredPrizeChange"]);
  });

  it("allows zero, which stops staff declaring cash prizes at all", async () => {
    // A real tightening rather than a nonsense value: the ceiling's own kill switch.
    await asSuperAdmin();

    const response = await patch({ maxSponsoredPrizeKobo: 0 });

    expect(response.status).toBe(200);
    expect((await settings()).maxSponsoredPrizeKobo).toBe(0);
  });

  it("refuses an amount that is not whole naira", async () => {
    await asSuperAdmin();
    const before = await settings();

    const response = await patch({ maxSponsoredPrizeKobo: 1_234 });

    expect(response.status).toBe(400);
    expect((await settings()).maxSponsoredPrizeKobo).toBe(before.maxSponsoredPrizeKobo);
  });

  it("refuses a non-staff caller", async () => {
    asNobody();
    const before = await settings();

    const response = await patch({ maxSponsoredPrizeKobo: 1_000_000_000 });

    expect(response.status).toBe(403);
    expect((await settings()).maxSponsoredPrizeKobo).toBe(before.maxSponsoredPrizeKobo);
  });
});

describe("kobo ceilings", () => {
  // ₦20,000,000 — round, inside INT4, far above any real setting.
  const OVER = 2_000_000_001;
  const ABSURD = 100_000_000_000;

  it("refuses a value the column cannot hold instead of failing on the write", async () => {
    // The regression: this used to be accepted by the check, reach Prisma,
    // and come back as a 500 from the route whose whole job is saying no.
    await asSuperAdmin();

    const response = await patch({ stakePatternNetAlertKobo: ABSURD });

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/whole number of naira/i);
  });

  it.each([
    ["maxLockedStakeKobo", { maxLockedStakeKobo: ABSURD }],
    ["maxDailyStakeKobo", { maxDailyStakeKobo: ABSURD }],
    ["payoutAutoApproveMaxKobo", { payoutAutoApproveMaxKobo: ABSURD }],
    ["stakePatternNetAlertKobo", { stakePatternNetAlertKobo: ABSURD }],
    ["maxSponsoredPrizeKobo", { maxSponsoredPrizeKobo: ABSURD }],
  ])("holds the line for %s", async (_field, body) => {
    await asSuperAdmin();

    expect((await patch(body)).status).toBe(400);
  });

  it("accepts a value just inside the ceiling", async () => {
    // The guard test: a bound that refuses everything is not a bound.
    await asSuperAdmin();

    const response = await patch({ stakePatternNetAlertKobo: 2_000_000_000 });

    expect(response.status).toBe(200);
    expect((await settings()).stakePatternNetAlertKobo).toBe(2_000_000_000);
  });

  it("refuses one kobo over", async () => {
    await asSuperAdmin();

    expect((await patch({ stakePatternNetAlertKobo: OVER })).status).toBe(400);
  });
});
