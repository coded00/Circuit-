import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { confirmEntryFeePayment } from "./confirm";
import { paystackClient } from "./paystack";
import { createTestOrganizer, createTestUser, cleanupAll } from "@/testHelpers";

/**
 * Regression test for the Phase 8 fix: confirmEntryFeePayment's new
 * PLATFORM_FEE/ORGANIZER_REVENUE rows used to be plain .create() calls
 * with no replay guard, unlike confirmWalletFunding's own conditional-
 * update pattern right below it in the same file. The webhook and the
 * polled redirect-callback page both funnel into this function — a real
 * double-credit path for the organizer if they land close together.
 *
 * provider.verifyCharge is stubbed (this sandbox/CI has no real Paystack
 * key) — everything downstream, including the fix under test, is the
 * real production code.
 */

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAll();
});

describe("confirmEntryFeePayment", () => {
  it("a concurrent replay of the same reference creates the PLATFORM_FEE/ORGANIZER_REVENUE rows exactly once", async () => {
    const entryFee = 100_000;
    const reference = `test-confirm-${Date.now()}`;

    vi.spyOn(paystackClient, "verifyCharge").mockResolvedValue({
      status: "SUCCESS",
      amount: entryFee,
      currency: "NGN",
      providerReference: reference,
      paidAt: new Date(),
    });

    const originalSetting = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
    await prisma.platformSetting.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", platformFeeBps: 500 },
      update: { platformFeeBps: 500 },
    });

    const organizer = await createTestOrganizer();
    const player = await createTestUser();
    const tournament = await prisma.tournament.create({
      data: {
        organizerId: organizer.id,
        name: `TEST-Tournament-${Date.now()}`,
        game: "Test Game",
        participantCap: 8,
        entryFee,
        registrationOpenAt: new Date(Date.now() - 3_600_000),
        registrationCloseAt: new Date(Date.now() + 3_600_000),
        startAt: new Date(Date.now() + 7_200_000),
      },
    });
    const registration = await prisma.registration.create({
      data: { tournamentId: tournament.id, userId: player.id, inGameId: "TestIGN", status: "PENDING_PAYMENT", paymentRef: reference },
    });
    await prisma.escrowTransaction.create({
      data: { tournamentId: tournament.id, registrationId: registration.id, type: "ENTRY_FEE", provider: "PAYSTACK", providerRef: reference, amount: entryFee, status: "PENDING" },
    });

    // The actual race: a webhook delivery and the polled redirect-
    // callback page both calling this for the same reference.
    await Promise.allSettled([confirmEntryFeePayment(reference), confirmEntryFeePayment(reference)]);

    const finalReg = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(finalReg.status).toBe("CONFIRMED");

    const rows = await prisma.escrowTransaction.findMany({ where: { registrationId: registration.id } });
    expect(rows.filter((r) => r.type === "PLATFORM_FEE")).toHaveLength(1);
    expect(rows.filter((r) => r.type === "ORGANIZER_REVENUE")).toHaveLength(1);

    const platformFee = rows.find((r) => r.type === "PLATFORM_FEE")!;
    const organizerRevenue = rows.find((r) => r.type === "ORGANIZER_REVENUE")!;
    expect(platformFee.amount).toBe(5_000);
    expect(organizerRevenue.amount).toBe(95_000);
    expect(platformFee.amount + organizerRevenue.amount).toBe(entryFee);

    // Cleanup this test's platform setting mutation.
    if (originalSetting) {
      await prisma.platformSetting.update({ where: { id: "singleton" }, data: { platformFeeBps: originalSetting.platformFeeBps } });
    }
  });

  it("is a safe no-op for an unknown reference", async () => {
    await expect(confirmEntryFeePayment(`test-unknown-ref-${Date.now()}`)).resolves.toBeUndefined();
  });
});
