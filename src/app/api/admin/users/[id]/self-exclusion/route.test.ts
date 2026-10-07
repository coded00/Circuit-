import { afterEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { cleanupAll, createTestStaff, createTestUser } from "@/testHelpers";
import { DAY_MS } from "@/lib/selfExclusion";
import { DELETE } from "./route";

/**
 * The only way a cool-off ends early, and therefore the only place the
 * asymmetry can be got wrong. It is a staff action because a player cannot
 * shorten their own — so the tests that matter are that it is genuinely
 * unavailable without staff, that it records who did it and what they ended,
 * and that it does not erase the exclusion's own history on the way out.
 */

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(), requireStaff: vi.fn() }));

const days = (n: number) => new Date(Date.now() + n * DAY_MS);

function lift(userId: string, body: unknown = {}, reason?: string) {
  return DELETE(
    new Request(`http://localhost/api/admin/users/${userId}/self-exclusion`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reason === undefined ? body : { reason }),
    }),
    { params: Promise.resolve({ id: userId }) }
  );
}

function asStaff(staff: Awaited<ReturnType<typeof createTestStaff>>) {
  vi.mocked(requireStaff).mockResolvedValue({ user: staff, error: null });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAll();
});

describe("DELETE /api/admin/users/[id]/self-exclusion", () => {
  it("ends a running cool-off", async () => {
    const staff = await createTestStaff();
    const player = await createTestUser({ selfExcludedUntil: days(30), selfExcludedAt: days(-1) });
    asStaff(staff);

    const response = await lift(player.id);

    expect(response.status).toBe(200);
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: player.id },
      select: { selfExcludedUntil: true, selfExcludedAt: true },
    });
    expect(stored.selfExcludedUntil).toBeNull();
    // The start date stays. It is the record that the cool-off happened, and
    // clearing it would delete the evidence a later review would look for.
    expect(stored.selfExcludedAt).not.toBeNull();
  });

  it("records who lifted it, and the cool-off they cut short", async () => {
    const staff = await createTestStaff();
    const player = await createTestUser({ selfExcludedUntil: days(30), selfExcludedAt: days(-1) });
    asStaff(staff);

    await lift(player.id, {}, "player wrote in, said they were ready");

    const entries = await prisma.auditLogEntry.findMany({ where: { actorId: staff.id, targetId: player.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("user.selfExclusionLift");
    const metadata = entries[0].metadata as { reason: string | null; wasUntil: string; wasSince: string | null };
    expect(metadata.reason).toBe("player wrote in, said they were ready");
    // The end date that was lifted is nowhere else — once the column is null
    // this is the only account of what was overridden.
    expect(new Date(metadata.wasUntil).getTime()).toBeCloseTo(days(30).getTime(), -4);
    expect(new Date(metadata.wasSince!).getTime()).toBeCloseTo(days(-1).getTime(), -4);
  });

  it("lifts without a reason rather than refusing", async () => {
    // Asking a player to keep waiting because staff can't articulate why is
    // the wrong trade; the entry is still written.
    const staff = await createTestStaff();
    const player = await createTestUser({ selfExcludedUntil: days(30), selfExcludedAt: days(-1) });
    asStaff(staff);

    const response = await lift(player.id, {});

    expect(response.status).toBe(200);
    const entry = await prisma.auditLogEntry.findFirstOrThrow({ where: { actorId: staff.id, targetId: player.id } });
    expect((entry.metadata as { reason: string | null }).reason).toBeNull();
  });

  it("refuses when no cool-off is in force, so nothing is logged as lifted", async () => {
    const staff = await createTestStaff();
    const never = await createTestUser();
    const expired = await createTestUser({ selfExcludedUntil: days(-1), selfExcludedAt: days(-30) });
    asStaff(staff);

    expect((await lift(never.id)).status).toBe(409);
    expect((await lift(expired.id)).status).toBe(409);
    // An expired cool-off is already over — clearing the dates would erase the
    // record of a break that really happened.
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: expired.id }, select: { selfExcludedUntil: true } });
    expect(stored.selfExcludedUntil).not.toBeNull();
    expect(await prisma.auditLogEntry.count({ where: { actorId: staff.id } })).toBe(0);
  });

  it("404s an unknown user", async () => {
    asStaff(await createTestStaff());

    expect((await lift("does-not-exist")).status).toBe(404);
  });

  it("is not reachable without staff access", async () => {
    const player = await createTestUser({ selfExcludedUntil: days(30), selfExcludedAt: days(-1) });
    vi.mocked(requireStaff).mockResolvedValue({
      user: null,
      error: NextResponse.json({ error: "Staff access required." }, { status: 403 }),
    });

    const response = await lift(player.id);

    expect(response.status).toBe(403);
    // Untouched: the gate runs before anything is read or written.
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: player.id }, select: { selfExcludedUntil: true } });
    expect(stored.selfExcludedUntil).not.toBeNull();
  });
});
