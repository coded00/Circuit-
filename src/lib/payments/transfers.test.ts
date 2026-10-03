import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { applyRefundOutcome, applyTransferOutcome, currentPaidEntryFee, issueEntryFeeRefund, reconcilePendingMoney, refundRef, voidEntryFeeRevenue } from "./transfers";
import { confirmEntryFeePayment } from "./confirm";
import { paystackClient } from "./paystack";
import { createTestOrganizer, createTestTournament, createTestUser, cleanupAll, uniqueSuffix } from "@/testHelpers";

/**
 * Transfer and refund outcomes (src/lib/payments/transfers.ts). Provider
 * calls are stubbed — this sandbox/CI has no real Paystack key — and
 * everything downstream is the real code against the real database.
 */

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAll();
});

async function pendingWithdrawal(amount = 50_000, balanceAfterDebit = 0) {
  const user = await createTestUser({ walletBalance: balanceAfterDebit });
  const reference = `test-withdraw-${uniqueSuffix()}`;
  await prisma.walletTransaction.create({
    data: { userId: user.id, type: "WITHDRAWAL", amount, provider: "PAYSTACK", providerRef: reference, status: "PENDING" },
  });
  return { user, reference };
}

describe("applyTransferOutcome — withdrawals", () => {
  it("marks a successful withdrawal complete without touching the balance", async () => {
    const { user, reference } = await pendingWithdrawal();
    expect(await applyTransferOutcome(reference, "SUCCESS")).toBe("APPLIED");
    expect(await applyTransferOutcome(reference, "SUCCESS")).toBe("NO_CHANGE");
    const txn = await prisma.walletTransaction.findUniqueOrThrow({ where: { providerRef: reference } });
    expect(txn.status).toBe("COMPLETE");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).walletBalance).toBe(0);
  });

  it("returns a failed withdrawal's money exactly once, even when replayed concurrently", async () => {
    const { user, reference } = await pendingWithdrawal(50_000, 10_000);
    await Promise.all([
      applyTransferOutcome(reference, "FAILED"),
      applyTransferOutcome(reference, "FAILED"),
      applyTransferOutcome(reference, "REVERSED"),
    ]);
    const txn = await prisma.walletTransaction.findUniqueOrThrow({ where: { providerRef: reference } });
    expect(txn.status).toBe("FAILED");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).walletBalance).toBe(60_000);
    const notes = await prisma.notification.findMany({ where: { userId: user.id, type: "WITHDRAWAL_RETURNED" } });
    expect(notes).toHaveLength(1);
  });

  it("returns the money when a completed withdrawal is reversed", async () => {
    const { user, reference } = await pendingWithdrawal(50_000);
    await applyTransferOutcome(reference, "SUCCESS");
    expect(await applyTransferOutcome(reference, "REVERSED")).toBe("APPLIED");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).walletBalance).toBe(50_000);
  });

  it("ignores a reference it doesn't know", async () => {
    expect(await applyTransferOutcome(`test-nope-${uniqueSuffix()}`, "FAILED")).toBe("UNKNOWN");
  });
});

describe("applyTransferOutcome — prize payouts", () => {
  it("reopens a failed prize payout so it can be claimed again", async () => {
    const organizer = await createTestOrganizer();
    const winner = await createTestUser();
    const tournament = await createTestTournament(organizer.id, { status: "COMPLETE", prizeAmount: 100_000 });
    const reference = `test-payout-${uniqueSuffix()}`;
    await prisma.escrowTransaction.create({
      data: { tournamentId: tournament.id, type: "PRIZE_PAYOUT", amount: 100_000, userId: winner.id, place: 1, provider: "PAYSTACK", providerRef: reference, status: "PENDING" },
    });
    expect(await applyTransferOutcome(reference, "FAILED")).toBe("APPLIED");
    const row = await prisma.escrowTransaction.findUniqueOrThrow({ where: { providerRef: reference } });
    expect(row.status).toBe("FAILED");
    expect(await prisma.notification.count({ where: { userId: winner.id, type: "PRIZE_PAYOUT_FAILED" } })).toBe(1);
  });
});

async function paidEntry(status: "CONFIRMED" | "WITHDRAWN" | "PENDING_PAYMENT", feeStatus: "COMPLETE" | "PENDING") {
  const organizer = await createTestOrganizer();
  const player = await createTestUser();
  const tournament = await createTestTournament(organizer.id, { entryFee: 100_000 });
  const reference = `test-charge-${uniqueSuffix()}`;
  const registration = await prisma.registration.create({
    data: { tournamentId: tournament.id, userId: player.id, inGameId: "TestIGN", status, paymentRef: reference },
  });
  await prisma.escrowTransaction.create({
    data: { tournamentId: tournament.id, registrationId: registration.id, type: "ENTRY_FEE", provider: "PAYSTACK", providerRef: reference, amount: 100_000, status: feeStatus },
  });
  return { player, tournament, registration, reference };
}

describe("entry-fee refunds", () => {
  it("records a refund under its own reference (not the charge's), and settles it from the webhook", async () => {
    const { tournament, registration, reference } = await paidEntry("CONFIRMED", "COMPLETE");
    vi.spyOn(paystackClient, "refundCharge").mockResolvedValue({ status: "PENDING", providerReference: reference });

    expect(
      await issueEntryFeeRefund({ tournamentId: tournament.id, registrationId: registration.id, provider: "PAYSTACK", chargeRef: reference, amount: 100_000 })
    ).toBe("PENDING");
    const refund = await prisma.escrowTransaction.findUniqueOrThrow({ where: { providerRef: refundRef(reference) } });
    expect(refund).toMatchObject({ type: "REFUND", status: "PENDING", amount: 100_000 });

    expect(await applyRefundOutcome(reference, "SUCCESS")).toBe("APPLIED");
    expect(await applyRefundOutcome(reference, "FAILED")).toBe("NO_CHANGE");
    expect((await prisma.escrowTransaction.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe("COMPLETE");
  });

  it("tells a withdrawing player their card refund started, and again when it completes", async () => {
    const { player, tournament, registration, reference } = await paidEntry("CONFIRMED", "COMPLETE");
    vi.spyOn(paystackClient, "refundCharge").mockResolvedValue({ status: "PENDING", providerReference: reference });

    await issueEntryFeeRefund({ tournamentId: tournament.id, registrationId: registration.id, provider: "PAYSTACK", chargeRef: reference, amount: 100_000, notifyPlayer: true });
    await applyRefundOutcome(reference, "SUCCESS");
    await applyRefundOutcome(reference, "SUCCESS");

    const stages = (await prisma.notification.findMany({ where: { userId: player.id, type: "ENTRY_FEE_REFUND" }, orderBy: { createdAt: "asc" } })).map(
      (n) => (n.payload as { stage: string }).stage
    );
    expect(stages).toEqual(["STARTED", "DONE"]);
  });

  it("refunds a wallet-paid entry into the wallet, without calling the provider", async () => {
    const { player, tournament, registration } = await paidEntry("CONFIRMED", "COMPLETE");
    const walletRef = `wallet_entry_${uniqueSuffix()}`;
    await prisma.escrowTransaction.updateMany({ where: { registrationId: registration.id, type: "ENTRY_FEE" }, data: { providerRef: walletRef } });
    const providerCall = vi.spyOn(paystackClient, "refundCharge");

    expect(
      await issueEntryFeeRefund({ tournamentId: tournament.id, registrationId: registration.id, provider: "PAYSTACK", chargeRef: walletRef, amount: 100_000, notifyPlayer: true })
    ).toBe("COMPLETE");

    expect(providerCall).not.toHaveBeenCalled();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: player.id } })).walletBalance).toBe(100_000);
    expect(await prisma.walletTransaction.count({ where: { userId: player.id, type: "ENTRY_FEE_REFUND", status: "COMPLETE" } })).toBe(1);
    expect((await prisma.escrowTransaction.findUniqueOrThrow({ where: { providerRef: refundRef(walletRef) } })).status).toBe("COMPLETE");
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: player.id, type: "ENTRY_FEE_REFUND" } });
    expect((note.payload as { stage: string }).stage).toBe("WALLET");
  });

  it("after a refund, picks the newer payment of a player who joined again — not the refunded one", async () => {
    const { tournament, registration, reference } = await paidEntry("CONFIRMED", "COMPLETE");
    await issueEntryFeeRefund({ tournamentId: tournament.id, registrationId: registration.id, provider: "PAYSTACK", chargeRef: `wallet_entry_${reference}`, amount: 1 }).catch(() => undefined);
    const oldRef = `wallet_entry_${uniqueSuffix()}`;
    const newRef = `wallet_entry_${uniqueSuffix()}`;
    const at = (ms: number) => new Date(Date.now() + ms);
    const rows = await Promise.all([
      prisma.escrowTransaction.create({ data: { tournamentId: tournament.id, registrationId: registration.id, type: "ENTRY_FEE", provider: "PAYSTACK", providerRef: oldRef, amount: 100_000, status: "COMPLETE", createdAt: at(-2000) } }),
      prisma.escrowTransaction.create({ data: { tournamentId: tournament.id, registrationId: registration.id, type: "REFUND", provider: "PAYSTACK", providerRef: refundRef(oldRef), amount: 100_000, status: "COMPLETE", createdAt: at(-1000) } }),
      prisma.escrowTransaction.create({ data: { tournamentId: tournament.id, registrationId: registration.id, type: "ENTRY_FEE", provider: "PAYSTACK", providerRef: newRef, amount: 100_000, status: "COMPLETE", createdAt: at(0) } }),
    ]);
    expect(currentPaidEntryFee(rows)?.providerRef).toBe(newRef);
    expect(currentPaidEntryFee(rows.slice(0, 2))).toBeUndefined();
  });

  it("voids the platform fee and the organizer's share of a refunded entry", async () => {
    const { tournament, registration } = await paidEntry("CONFIRMED", "COMPLETE");
    await prisma.escrowTransaction.createMany({
      data: [
        { tournamentId: tournament.id, registrationId: registration.id, type: "PLATFORM_FEE", amount: 5_000, status: "COMPLETE" },
        { tournamentId: tournament.id, registrationId: registration.id, type: "ORGANIZER_REVENUE", amount: 95_000, status: "PENDING" },
      ],
    });
    await voidEntryFeeRevenue(registration.id);
    const rows = await prisma.escrowTransaction.findMany({ where: { registrationId: registration.id } });
    expect(rows.find((r) => r.type === "PLATFORM_FEE")?.status).toBe("FAILED");
    expect(rows.find((r) => r.type === "ORGANIZER_REVENUE")?.status).toBe("FAILED");
    expect(rows.find((r) => r.type === "ENTRY_FEE")?.status).toBe("COMPLETE");
  });

  it("leaves no REFUND row behind when the provider call throws", async () => {
    const { tournament, registration, reference } = await paidEntry("CONFIRMED", "COMPLETE");
    vi.spyOn(paystackClient, "refundCharge").mockRejectedValue(new Error("network"));
    await expect(
      issueEntryFeeRefund({ tournamentId: tournament.id, registrationId: registration.id, provider: "PAYSTACK", chargeRef: reference, amount: 100_000 })
    ).rejects.toThrow("network");
    expect(await prisma.escrowTransaction.count({ where: { registrationId: registration.id, type: "REFUND" } })).toBe(0);
  });
});

describe("late payments", () => {
  function stubPaidCharge(reference: string) {
    vi.spyOn(paystackClient, "verifyCharge").mockResolvedValue({ status: "SUCCESS", amount: 100_000, currency: "NGN", providerReference: reference, paidAt: new Date() });
    return vi.spyOn(paystackClient, "refundCharge").mockResolvedValue({ status: "SUCCESS", providerReference: reference });
  }

  it("refunds a charge that completes after the player withdrew — once, however many times it's confirmed", async () => {
    const { player, registration, reference } = await paidEntry("WITHDRAWN", "PENDING");
    const refundCall = stubPaidCharge(reference);

    await Promise.allSettled([confirmEntryFeePayment(reference), confirmEntryFeePayment(reference)]);
    await confirmEntryFeePayment(reference);

    expect(refundCall).toHaveBeenCalledTimes(1);
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })).status).toBe("REFUNDED");
    const rows = await prisma.escrowTransaction.findMany({ where: { registrationId: registration.id } });
    expect(rows.find((r) => r.type === "ENTRY_FEE")?.status).toBe("COMPLETE");
    expect(rows.filter((r) => r.type === "REFUND").map((r) => r.status)).toEqual(["COMPLETE"]);
    expect(rows.some((r) => r.type === "PLATFORM_FEE" || r.type === "ORGANIZER_REVENUE")).toBe(false);
    expect(await prisma.notification.count({ where: { userId: player.id, type: "PAYMENT_REFUNDED" } })).toBe(1);
  });

  it("refunds an older charge superseded by a fresh checkout, without touching the new one", async () => {
    const { registration, reference: oldRef } = await paidEntry("PENDING_PAYMENT", "PENDING");
    const newRef = `test-charge-new-${uniqueSuffix()}`;
    await prisma.registration.update({ where: { id: registration.id }, data: { paymentRef: newRef } });
    const refundCall = stubPaidCharge(oldRef);

    await confirmEntryFeePayment(oldRef);

    expect(refundCall).toHaveBeenCalledWith(oldRef, 100_000);
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })).status).toBe("PENDING_PAYMENT");
  });

  it("the sweep finds a withdrawn player's late payment on its own", async () => {
    const { registration, reference } = await paidEntry("WITHDRAWN", "PENDING");
    await prisma.escrowTransaction.updateMany({ where: { providerRef: reference }, data: { createdAt: new Date(Date.now() - 20 * 60_000) } });
    const refundCall = stubPaidCharge(reference);

    const result = await reconcilePendingMoney();

    expect(result.latePaymentsChecked).toBeGreaterThanOrEqual(1);
    expect(refundCall).toHaveBeenCalledWith(reference, 100_000);
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })).status).toBe("REFUNDED");
  });

  it("the sweep settles a transfer whose webhook never came", async () => {
    const { user, reference } = await pendingWithdrawal(50_000);
    await prisma.walletTransaction.updateMany({ where: { providerRef: reference }, data: { createdAt: new Date(Date.now() - 45 * 60_000) } });
    vi.spyOn(paystackClient, "verifyTransfer").mockImplementation(async (ref) => (ref === reference ? "FAILED" : "PENDING"));

    await reconcilePendingMoney();

    expect((await prisma.walletTransaction.findUniqueOrThrow({ where: { providerRef: reference } })).status).toBe("FAILED");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).walletBalance).toBe(50_000);
  });
});
