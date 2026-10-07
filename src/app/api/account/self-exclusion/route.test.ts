import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { cleanupAll, createTestUser } from "@/testHelpers";
import { DAY_MS, formatSelfExclusionDate } from "@/lib/selfExclusion";
import { POST } from "./route";

/**
 * The one action on a player's account that they cannot undo. Two things are
 * being checked here: that a longer cool-off always wins, and that a shorter
 * one is refused rather than quietly ignored — a request that returns 200 and
 * does nothing would let someone believe they had ended a cool-off that is
 * still running.
 *
 * The route re-reads the account rather than trusting the session copy, so
 * these tests mock `getCurrentUser` with an object whose exclusion fields are
 * deliberately stale: what the route decides on has to come from the database.
 */

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));

const days = (n: number) => new Date(Date.now() + n * DAY_MS);

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/account/self-exclusion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

function exclusionOf(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { selfExcludedUntil: true, selfExcludedAt: true },
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAll();
});

describe("POST /api/account/self-exclusion", () => {
  it("sets a cool-off and records when it began", async () => {
    const user = await createTestUser();
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const response = await post({ days: 7 });

    expect(response.status).toBe(200);
    const stored = await exclusionOf(user.id);
    expect(stored.selfExcludedUntil!.getTime()).toBeCloseTo(days(7).getTime(), -4);
    expect(stored.selfExcludedAt!.getTime()).toBeCloseTo(Date.now(), -4);
  });

  it("leaves a confirmation in the player's notifications", async () => {
    // The receipt: this is the setting a player may later want evidence they
    // chose, and an in-app row is the version that doesn't depend on them
    // keeping an email.
    const user = await createTestUser();
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    await post({ days: 7 });

    const notes = await prisma.notification.findMany({ where: { userId: user.id, type: "SELF_EXCLUSION_SET" } });
    expect(notes).toHaveLength(1);
    expect((notes[0].payload as { extended?: boolean }).extended).toBe(false);
  });

  it("extends a running cool-off, and keeps the original start date", async () => {
    const user = await createTestUser({ selfExcludedUntil: days(3), selfExcludedAt: days(-10) });
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const response = await post({ days: 30 });

    expect(response.status).toBe(200);
    const stored = await exclusionOf(user.id);
    expect(stored.selfExcludedUntil!.getTime()).toBeCloseTo(days(30).getTime(), -4);
    // Not "now" — an extension is the same break, longer.
    expect(stored.selfExcludedAt!.getTime()).toBeCloseTo(days(-10).getTime(), -4);
  });

  it("refuses to shorten a running cool-off, leaving the end date where it was", async () => {
    const user = await createTestUser({ selfExcludedUntil: days(30), selfExcludedAt: days(-1) });
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const response = await post({ days: 7 });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    // Naming the date already on file is the useful part of the refusal.
    expect(body.error).toContain(formatSelfExclusionDate(days(30)));
    expect(body.error).toMatch(/extend it, but not shorten/i);
    const stored = await exclusionOf(user.id);
    expect(stored.selfExcludedUntil!.getTime()).toBeCloseTo(days(30).getTime(), -4);
  });

  it("accepts a new cool-off once the old one has expired", async () => {
    const user = await createTestUser({ selfExcludedUntil: days(-1), selfExcludedAt: days(-30) });
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const response = await post({ days: 7 });

    expect(response.status).toBe(200);
    const stored = await exclusionOf(user.id);
    expect(stored.selfExcludedUntil!.getTime()).toBeCloseTo(days(7).getTime(), -4);
    // A new break starts now, not thirty days ago.
    expect(stored.selfExcludedAt!.getTime()).toBeCloseTo(Date.now(), -4);
  });

  it("refuses a duration that isn't a whole number of days in range, and writes nothing", async () => {
    const user = await createTestUser();
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    for (const value of [0, -7, 1.5, 2000, "7", null]) {
      const response = await post({ days: value });
      expect(response.status, `days: ${String(value)}`).toBe(400);
    }

    const stored = await exclusionOf(user.id);
    expect(stored.selfExcludedUntil).toBeNull();
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(0);
  });

  it("requires a signed-in player", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await post({ days: 7 });

    expect(response.status).toBe(401);
  });
});
