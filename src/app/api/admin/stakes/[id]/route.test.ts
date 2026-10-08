import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cleanupAll, createTestStaff, createTestUser } from "@/testHelpers";
import { orderPair } from "@/lib/stakePatterns";
import { PATCH } from "./route";

/**
 * Closing a repeated-pair flag. The sweep writes flags; this is the only
 * thing a person writes back, and the only thing that takes a pair out of
 * the queue — so a queue with no working way to close a flag is a queue that
 * grows until nobody reads it.
 *
 * Two things matter beyond the happy path. The note requirement on ACTIONED:
 * a flag closed as "something was done" with nothing written on it is worse
 * than one left open, because the next person to look at the pair has no way
 * to find out what. And the OPEN guard: two staff opening the same flag at
 * once is ordinary, and the second answer must not silently replace the
 * first.
 */

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(), requireStaff: vi.fn() }));

const { requireStaff } = await import("@/lib/session");

beforeEach(() => {
  vi.mocked(requireStaff).mockReset();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAll();
});

/** A new OPEN flag over two fresh accounts. */
async function openFlag(overrides: Record<string, unknown> = {}) {
  const alice = await createTestUser();
  const bob = await createTestUser();
  const { userAId, userBId } = orderPair(alice.id, bob.id);
  const flag = await prisma.stakePatternFlag.create({
    data: {
      userAId,
      userBId,
      status: "OPEN",
      reasons: ["ONE_SIDED"],
      battleCount: 5,
      userAWins: 5,
      userBWins: 0,
      netKobo: 10_000_000,
      windowDays: 90,
      firstBattleAt: new Date("2026-08-01T00:00:00.000Z"),
      lastBattleAt: new Date("2026-09-01T00:00:00.000Z"),
      ...overrides,
    },
  });
  return { flag, alice, bob };
}

function patch(id: string, body: unknown) {
  return PATCH(new Request(`http://localhost/api/admin/stakes/${id}`, { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });
}

async function asStaff() {
  const staff = await createTestStaff();
  vi.mocked(requireStaff).mockResolvedValue({ user: staff, error: null } as never);
  return staff;
}

function asNobody() {
  vi.mocked(requireStaff).mockResolvedValue({
    user: null,
    error: NextResponse.json({ error: "Staff access required." }, { status: 403 }),
  } as never);
}

describe("closing a stake-pattern flag", () => {
  it("dismisses a flag with no note, and records who did it", async () => {
    // The common case — two friends who play each other constantly. A queue
    // that demands a paragraph before it will let you clear an innocent pair
    // is a queue that stops getting cleared.
    const staff = await asStaff();
    const { flag } = await openFlag();

    const response = await patch(flag.id, { status: "DISMISSED" });

    expect(response.status).toBe(200);
    const updated = await prisma.stakePatternFlag.findUniqueOrThrow({ where: { id: flag.id } });
    expect(updated.status).toBe("DISMISSED");
    expect(updated.reviewedById).toBe(staff.id);
    expect(updated.reviewedAt).not.toBeNull();
    expect(updated.reviewNote).toBeNull();
  });

  it("refuses to mark a flag actioned with no note, and changes nothing", async () => {
    await asStaff();
    const { flag } = await openFlag();

    const response = await patch(flag.id, { status: "ACTIONED" });

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/what was done/i);
    expect((await prisma.stakePatternFlag.findUniqueOrThrow({ where: { id: flag.id } })).status).toBe("OPEN");
  });

  it("marks a flag actioned and keeps the note", async () => {
    await asStaff();
    const { flag } = await openFlag();

    const response = await patch(flag.id, { status: "ACTIONED", note: "Same device, one account suspended." });

    expect(response.status).toBe(200);
    const updated = await prisma.stakePatternFlag.findUniqueOrThrow({ where: { id: flag.id } });
    expect(updated.status).toBe("ACTIONED");
    expect(updated.reviewNote).toBe("Same device, one account suspended.");
  });

  it("leaves an audit entry naming the pair and what was found", async () => {
    // A closed flag is a moderation decision about two real accounts, and
    // the row itself is mutable by nothing — the audit log is where "who
    // decided this, and when" has to live.
    const staff = await asStaff();
    const { flag, alice, bob } = await openFlag();

    await patch(flag.id, { status: "ACTIONED", note: "Confirmed one operator." });

    const entry = await prisma.auditLogEntry.findFirstOrThrow({
      where: { actorId: staff.id, action: "stakePattern.review", targetId: flag.id },
    });
    expect(entry.targetType).toBe("StakePatternFlag");
    expect(entry.metadata).toMatchObject({
      status: "ACTIONED",
      note: "Confirmed one operator.",
      userAId: orderPair(alice.id, bob.id).userAId,
      battleCount: 5,
      netKobo: 10_000_000,
    });
  });

  it("refuses a second answer on a flag someone has already closed", async () => {
    // Two staff working the same queue will open the same flag. The second
    // one's answer must not overwrite the first's without them knowing.
    await asStaff();
    const { flag } = await openFlag();
    await patch(flag.id, { status: "DISMISSED", note: "Nothing here." });

    const response = await patch(flag.id, { status: "ACTIONED", note: "Actually, suspend them." });

    expect(response.status).toBe(409);
    const updated = await prisma.stakePatternFlag.findUniqueOrThrow({ where: { id: flag.id } });
    expect(updated.status).toBe("DISMISSED");
    expect(updated.reviewNote).toBe("Nothing here.");
  });

  it("refuses a status outside the two answers", async () => {
    await asStaff();
    const { flag } = await openFlag();

    const response = await patch(flag.id, { status: "OPEN" });

    expect(response.status).toBe(400);
    expect((await prisma.stakePatternFlag.findUniqueOrThrow({ where: { id: flag.id } })).status).toBe("OPEN");
  });

  it("refuses a non-staff caller, and writes nothing", async () => {
    asNobody();
    const { flag } = await openFlag();

    const response = await patch(flag.id, { status: "DISMISSED" });

    expect(response.status).toBe(403);
    expect((await prisma.stakePatternFlag.findUniqueOrThrow({ where: { id: flag.id } })).status).toBe("OPEN");
  });

  it("404s an unknown flag", async () => {
    await asStaff();

    const response = await patch("no-such-flag", { status: "DISMISSED" });

    expect(response.status).toBe(404);
  });
});
