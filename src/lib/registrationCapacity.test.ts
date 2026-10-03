import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { generateBracket } from "@/lib/matches";
import { confirmEntryFeePayment } from "@/lib/payments/confirm";
import { paystackClient } from "@/lib/payments/paystack";
import { POST as register } from "@/app/api/tournaments/[id]/registrations/route";
import { createTestOrganizer, createTestTournament, createTestUser, cleanupAll, uniqueSuffix } from "@/testHelpers";

/**
 * Two rare races: the last open registration slot (src/lib/
 * registrationCapacity.ts) and two triggers starting the same bracket.
 */

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));

afterEach(async () => {
  vi.restoreAllMocks();
  const tournaments = await prisma.tournament.findMany({ where: { name: { startsWith: "TEST-" } }, select: { id: true } });
  await prisma.bracket.deleteMany({ where: { tournamentId: { in: tournaments.map((t) => t.id) } } });
  await cleanupAll();
});

const post = (tournamentId: string) =>
  register(new Request("http://test/api", { method: "POST", body: JSON.stringify({ inGameId: "TestIGN" }) }), {
    params: Promise.resolve({ id: tournamentId }),
  });

describe("the last open slot", () => {
  it("two players registering for the last free slot at once: exactly one gets in", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await createTestTournament(organizer.id, { participantCap: 1 });
    const [a, b] = [await createTestUser(), await createTestUser()];
    vi.mocked(getCurrentUser).mockResolvedValueOnce(a).mockResolvedValueOnce(b);

    const responses = await Promise.all([post(tournament.id), post(tournament.id)]);

    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.registration.count({ where: { tournamentId: tournament.id, status: "CONFIRMED" } })).toBe(1);
  });

  it("two payments confirming for the last slot at once: one is confirmed, the other refunded", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await createTestTournament(organizer.id, { participantCap: 1, entryFee: 100_000 });
    const refs: string[] = [];
    for (let i = 0; i < 2; i++) {
      const player = await createTestUser();
      const ref = `test-slot-${uniqueSuffix()}`;
      const reg = await prisma.registration.create({
        data: { tournamentId: tournament.id, userId: player.id, inGameId: "TestIGN", status: "PENDING_PAYMENT", paymentRef: ref },
      });
      await prisma.escrowTransaction.create({
        data: { tournamentId: tournament.id, registrationId: reg.id, type: "ENTRY_FEE", provider: "PAYSTACK", providerRef: ref, amount: 100_000, status: "PENDING" },
      });
      refs.push(ref);
    }
    vi.spyOn(paystackClient, "verifyCharge").mockImplementation(async (ref) => ({ status: "SUCCESS", amount: 100_000, currency: "NGN", providerReference: ref, paidAt: new Date() }));
    const refund = vi.spyOn(paystackClient, "refundCharge").mockImplementation(async (ref) => ({ status: "PENDING", providerReference: ref }));

    await Promise.all(refs.map((ref) => confirmEntryFeePayment(ref)));

    const regs = await prisma.registration.findMany({ where: { tournamentId: tournament.id } });
    expect(regs.map((r) => r.status).sort()).toEqual(["CONFIRMED", "REFUNDED"]);
    expect(refund).toHaveBeenCalledTimes(1);
  });
});

describe("two triggers starting the same bracket", () => {
  for (const format of ["SINGLE_ELIMINATION", "ROUND_ROBIN", "DOUBLE_ELIMINATION", "SWISS"] as const) {
    it(`${format}: one bracket, one set of matches`, async () => {
      const organizer = await createTestOrganizer();
      const tournament = await createTestTournament(organizer.id, { format, participantCap: 4 });
      for (let i = 0; i < 4; i++) {
        const player = await createTestUser();
        await prisma.registration.create({ data: { tournamentId: tournament.id, userId: player.id, inGameId: "TestIGN", status: "CONFIRMED" } });
      }

      await Promise.all([generateBracket(tournament.id), generateBracket(tournament.id), generateBracket(tournament.id)]);

      expect(await prisma.bracket.count({ where: { tournamentId: tournament.id } })).toBe(1);
      const expected = { SINGLE_ELIMINATION: 2, ROUND_ROBIN: 6, DOUBLE_ELIMINATION: 2, SWISS: 2 }[format];
      expect(await prisma.match.count({ where: { tournamentId: tournament.id } })).toBe(expected);
    });
  }
});
