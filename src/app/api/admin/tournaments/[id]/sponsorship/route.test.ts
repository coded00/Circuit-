import { afterEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { cleanupAll, createTestOrganizer, createTestStaff, createTestTournament } from "@/testHelpers";
import { MAX_KOBO_COLUMN } from "@/lib/money";
import { POST } from "./route";

/**
 * Recording where a sponsored prize's money comes from — the write side of TournamentSponsorship, and the
 * only way a sponsored payout can ever become approvable.
 *
 * The tests that matter are the refusals, because this route is a declaration that unlocks platform money:
 * an amount that isn't a real figure (zero, a fraction of a naira, one too large for the column) or a
 * missing source would each produce a record that reads like a checked fact while stating nothing, which is
 * worse than having no record at all. The one write rule that isn't about validation is the last test: once
 * a payout is approved, the figure it was approved against must stop moving.
 */

vi.mock("@/lib/session", () => ({ requireStaff: vi.fn() }));

function asStaff(staff: Awaited<ReturnType<typeof createTestStaff>>) {
  vi.mocked(requireStaff).mockResolvedValue({ user: staff, error: null });
}

function record(tournamentId: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/admin/tournaments/${tournamentId}/sponsorship`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: tournamentId }) }
  );
}

async function aTournament() {
  const organizer = await createTestOrganizer({ isStaff: true });
  return createTestTournament(organizer.id, { status: "COMPLETE", entryFee: 0, prizeAmount: 50_000 });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAll();
});

describe("POST /api/admin/tournaments/[id]/sponsorship", () => {
  it("records a sponsorship, and puts the amount on the audit row", async () => {
    const staff = await createTestStaff();
    asStaff(staff);
    const t = await aTournament();

    const response = await record(t.id, { amountKobo: 50_000, source: "Q3 marketing budget" });

    expect(response.status).toBe(200);
    const stored = await prisma.tournamentSponsorship.findUniqueOrThrow({ where: { tournamentId: t.id } });
    expect(stored).toMatchObject({ amountKobo: 50_000, source: "Q3 marketing budget", recordedById: staff.id });
    // Not just "a sponsorship was recorded": the audit row has to carry the figure, or an amount quietly
    // changed afterwards leaves no trace of what was declared at the time.
    const log = await prisma.auditLogEntry.findFirst({ where: { actorId: staff.id, action: "tournament.recordSponsorship", targetId: t.id } });
    expect(log?.metadata).toMatchObject({ amountKobo: 50_000, source: "Q3 marketing budget" });
  });

  it("replaces the existing record instead of adding a second one", async () => {
    const staff = await createTestStaff();
    asStaff(staff);
    const t = await aTournament();

    await record(t.id, { amountKobo: 50_000, source: "First guess" });
    const response = await record(t.id, { amountKobo: 80_000, source: "The real sponsor" });

    expect(response.status).toBe(200);
    // One row, and it is the later figure: "the sponsorship" has to stay a single thing somebody can look
    // up, or a reader has to guess which of several records is the current one.
    const rows = await prisma.tournamentSponsorship.findMany({ where: { tournamentId: t.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amountKobo: 80_000, source: "The real sponsor" });
  });

  it("refuses a non-staff caller, and stores nothing", async () => {
    vi.mocked(requireStaff).mockResolvedValue({
      user: null,
      error: NextResponse.json({ error: "Staff only." }, { status: 403 }),
    } as never);
    const t = await aTournament();

    const response = await record(t.id, { amountKobo: 50_000, source: "Q3 marketing budget" });

    expect(response.status).toBe(403);
    expect(await prisma.tournamentSponsorship.count({ where: { tournamentId: t.id } })).toBe(0);
  });

  it("refuses an unknown tournament", async () => {
    asStaff(await createTestStaff());
    const response = await record("nope-does-not-exist", { amountKobo: 50_000, source: "Q3 marketing budget" });
    expect(response.status).toBe(404);
  });

  // Each of these would otherwise be stored and then read back as a record that covers money.
  it.each([
    ["zero", 0],
    ["negative", -50_000],
    ["a fraction of a naira", 50_050],
    ["not a number at all", "fifty thousand"],
    ["nothing", null],
    ["larger than the column can hold", MAX_KOBO_COLUMN + 100],
  ])("refuses %s as an amount", async (_label, amountKobo) => {
    asStaff(await createTestStaff());
    const t = await aTournament();

    const response = await record(t.id, { amountKobo, source: "Q3 marketing budget" });

    expect(response.status).toBe(400);
    expect(await prisma.tournamentSponsorship.count({ where: { tournamentId: t.id } })).toBe(0);
  });

  it("accepts a number sent as a string, because what is stored is the same amount", async () => {
    // Not a leniency worth closing: the route coerces the same way every settings route does, and the
    // checks that matter (whole naira, positive, inside the column) are on the value, which is what gets
    // stored. Pinned here so it is a decision rather than an accident of `Number()`.
    asStaff(await createTestStaff());
    const t = await aTournament();

    expect((await record(t.id, { amountKobo: "50000", source: "Q3 marketing budget" })).status).toBe(200);
    const stored = await prisma.tournamentSponsorship.findUniqueOrThrow({ where: { tournamentId: t.id } });
    expect(stored.amountKobo).toBe(50_000);
  });

  it("refuses an empty source — an amount with no origin is not a record of anything", async () => {
    asStaff(await createTestStaff());
    const t = await aTournament();
    for (const source of [undefined, "", "   "]) {
      const response = await record(t.id, { amountKobo: 50_000, source });
      expect(response.status).toBe(400);
    }
    expect(await prisma.tournamentSponsorship.count({ where: { tournamentId: t.id } })).toBe(0);
  });

  it("refuses once the payout is approved, and leaves the approved figure untouched", async () => {
    // An approval is a decision about a specific amount from a specific source. If the record could be
    // rewritten after the fact, the audit row would describe a figure nobody ever agreed to.
    const staff = await createTestStaff();
    asStaff(staff);
    const t = await aTournament();
    await record(t.id, { amountKobo: 50_000, source: "Q3 marketing budget" });
    await prisma.tournament.update({ where: { id: t.id }, data: { payoutApprovedAt: new Date(), payoutApprovedById: staff.id } });

    const response = await record(t.id, { amountKobo: 5_000_000, source: "Changed my mind" });

    expect(response.status).toBe(409);
    const stored = await prisma.tournamentSponsorship.findUniqueOrThrow({ where: { tournamentId: t.id } });
    expect(stored).toMatchObject({ amountKobo: 50_000, source: "Q3 marketing budget" });
  });
});
