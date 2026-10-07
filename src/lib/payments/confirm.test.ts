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
  // The settling-charge test below stubs the global fetch; without this it would leak into the tests that
  // follow it.
  vi.unstubAllGlobals();
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

  async function pendingEntry(tournamentOver: Record<string, unknown>, chargeAmount: number) {
    const reference = `test-confirm-late-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    vi.spyOn(paystackClient, "verifyCharge").mockResolvedValue({ status: "SUCCESS", amount: chargeAmount, currency: "NGN", providerReference: reference, paidAt: new Date() });
    vi.spyOn(paystackClient, "refundCharge").mockResolvedValue({ status: "SUCCESS", providerReference: reference });
    const organizer = await createTestOrganizer();
    const player = await createTestUser();
    const tournament = await prisma.tournament.create({
      data: {
        organizerId: organizer.id, name: `TEST-Tournament-${Date.now()}`, game: "Test Game", participantCap: 8, entryFee: 100_000,
        registrationOpenAt: new Date(Date.now() - 3_600_000), registrationCloseAt: new Date(Date.now() + 3_600_000), startAt: new Date(Date.now() + 7_200_000),
        ...tournamentOver,
      },
    });
    const registration = await prisma.registration.create({ data: { tournamentId: tournament.id, userId: player.id, inGameId: "TestIGN", status: "PENDING_PAYMENT", paymentRef: reference } });
    await prisma.escrowTransaction.create({ data: { tournamentId: tournament.id, registrationId: registration.id, type: "ENTRY_FEE", provider: "PAYSTACK", providerRef: reference, amount: chargeAmount, status: "PENDING" } });
    return { reference, tournament, registration };
  }

  it("refunds a payment that completes after the tournament was cancelled, and confirms nothing", async () => {
    const { reference, tournament, registration } = await pendingEntry({ status: "CANCELLED" }, 100_000);
    await confirmEntryFeePayment(reference);
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })).status).not.toBe("CONFIRMED");
    const rows = await prisma.escrowTransaction.findMany({ where: { tournamentId: tournament.id } });
    expect(rows.filter((r) => r.type === "REFUND")).toHaveLength(1);
    expect(rows.filter((r) => r.type === "ORGANIZER_REVENUE" || r.type === "PLATFORM_FEE")).toHaveLength(0);
    expect(paystackClient.refundCharge).toHaveBeenCalledTimes(1);
  });

  it("refunds a payment whose amount no longer matches the entry fee (the fee was changed mid-checkout)", async () => {
    const { reference, tournament, registration } = await pendingEntry({ entryFee: 150_000 }, 100_000);
    await confirmEntryFeePayment(reference);
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })).status).toBe("PENDING_PAYMENT"); // free to check out again at the new fee
    const rows = await prisma.escrowTransaction.findMany({ where: { tournamentId: tournament.id } });
    expect(rows.filter((r) => r.type === "REFUND")).toHaveLength(1);
    expect(rows.filter((r) => r.type === "ORGANIZER_REVENUE")).toHaveLength(0);
  });

  it("is a safe no-op for an unknown reference", async () => {
    await expect(confirmEntryFeePayment(`test-unknown-ref-${Date.now()}`)).resolves.toBeUndefined();
  });

  it("leaves a still-settling charge PENDING, so it can still be confirmed when it completes", async () => {
    // The money this guards. Paystack reports a charge as "ongoing"/"processing"/"queued" while it settles,
    // and treating any of those as FAILED flips this row terminally: the webhook replay returns early, and
    // reconcilePendingMoney only revisits PENDING rows. The charge then completes with Circuit holding the
    // player's money and the entry never confirmed — not collected, and not refunded either. PENDING leaves
    // every one of those paths open.
    //
    // Deliberately NOT stubbing verifyCharge (which pendingEntry does, and the other tests here want): the
    // bug is in that function's status mapping, so stubbing it would test nothing. fetch is stubbed instead,
    // and the real paystackClient.verifyCharge maps what Paystack really answers.
    const { reference, tournament, registration } = await pendingEntry({}, 100_000);
    vi.mocked(paystackClient.verifyCharge).mockRestore();
    const paystackSays = (status: string) =>
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ status: true, data: { status, amount: 100_000, currency: "NGN", reference, paid_at: null } }), { status: 200 }))
      );

    paystackSays("processing"); // still settling
    await confirmEntryFeePayment(reference);

    const row = await prisma.escrowTransaction.findFirstOrThrow({ where: { providerRef: reference } });
    expect(row.status).toBe("PENDING"); // not FAILED — nothing terminal has happened
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })).status).toBe("PENDING_PAYMENT");
    expect(await prisma.escrowTransaction.count({ where: { tournamentId: tournament.id, type: "REFUND" } })).toBe(0);

    // It settles: the same reference now confirms, and the fee is collected exactly once.
    paystackSays("success");
    await confirmEntryFeePayment(reference);

    expect((await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })).status).toBe("CONFIRMED");
    expect(await prisma.escrowTransaction.count({ where: { registrationId: registration.id, type: "ORGANIZER_REVENUE" } })).toBe(1);
  });
});
