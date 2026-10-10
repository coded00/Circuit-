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

// The alerting sink, so the stuck-money alert (finding #20) can be asserted on rather than only read in a
// console that CI throws away.
vi.mock("@/lib/observability", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
const { captureMessage } = await import("@/lib/observability");

/** The exact message the sweep raises once money has been out for a day. */
const STUCK_ALERT = "Money stuck: transfers still pending after a day";

afterEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(captureMessage).mockClear();
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

  /**
   * Finding #21. A withdrawal marked FAILED (the provider refused it, or the call threw) whose transfer
   * turns out to have gone out after all. Before this, the row stayed FAILED, the credited-back money stayed
   * in the wallet, and the only trace was a line in Sentry — Circuit paid the withdrawal *and* kept the
   * balance it had already given back, with a ledger that said neither had happened.
   */
  describe("a withdrawal that failed and then turned out to have succeeded", () => {
    /** A withdrawal that was refused — so the row is FAILED and the money is back in the wallet. */
    async function failedWithdrawal(amount = 50_000, balanceAfterRefund = 50_000) {
      const row = await pendingWithdrawal(amount, 0);
      await applyTransferOutcome(row.reference, "FAILED");
      if (balanceAfterRefund !== amount) {
        await prisma.user.update({ where: { id: row.user.id }, data: { walletBalance: balanceAfterRefund } });
      }
      vi.mocked(captureMessage).mockClear();
      return row;
    }

    it("takes the money back and records what actually happened", async () => {
      const { user, reference } = await failedWithdrawal();

      expect(await applyTransferOutcome(reference, "SUCCESS")).toBe("APPLIED");

      const txn = await prisma.walletTransaction.findUniqueOrThrow({ where: { providerRef: reference } });
      // The row has to move too. A FAILED row whose amount has been debited is the same lie the other way
      // up — /admin/finance would show a withdrawal that never paid out.
      expect(txn.status).toBe("COMPLETE");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).walletBalance).toBe(0);
    });

    it("takes it back exactly once, however many times the webhook arrives", async () => {
      const { user, reference } = await failedWithdrawal();

      await Promise.all([
        applyTransferOutcome(reference, "SUCCESS"),
        applyTransferOutcome(reference, "SUCCESS"),
        applyTransferOutcome(reference, "SUCCESS"),
      ]);

      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).walletBalance).toBe(0);
    });

    it("still alerts, because a provider that changed its mind is worth knowing about", async () => {
      const { reference } = await failedWithdrawal();

      await applyTransferOutcome(reference, "SUCCESS");

      expect(captureMessage).toHaveBeenCalledWith(
        "Withdrawal succeeded after it was marked failed and refunded to the wallet",
        "error",
        expect.objectContaining({ playerOverdrawn: false })
      );
    });

    it("lets the balance go negative when the player already spent the refunded money", async () => {
      // The money was given back, spent, and then the provider says it went out after all. Clawing back only
      // what is left would quietly forgive the difference; the truthful entry is that the player was paid
      // twice, and every spend path already requires a balance that covers the amount, so this blocks them
      // until it is settled.
      const { user, reference } = await failedWithdrawal(50_000, 5_000);

      await applyTransferOutcome(reference, "SUCCESS");

      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).walletBalance).toBe(-45_000);
    });

    it("says so when it had to go negative, so somebody can decide what to do about it", async () => {
      const { reference } = await failedWithdrawal(50_000, 5_000);

      await applyTransferOutcome(reference, "SUCCESS");

      expect(captureMessage).toHaveBeenCalledWith(
        "Withdrawal succeeded after it was marked failed and refunded to the wallet",
        "error",
        expect.objectContaining({ amount: 50_000, balanceAfterClawback: -45_000, playerOverdrawn: true })
      );
    });

    it("does nothing to a withdrawal that is already complete", async () => {
      // The ordinary replay. A COMPLETE row is not a FAILED one, and must not be debited again.
      const { user, reference } = await pendingWithdrawal(50_000, 0);
      await applyTransferOutcome(reference, "SUCCESS");
      vi.mocked(captureMessage).mockClear();

      expect(await applyTransferOutcome(reference, "SUCCESS")).toBe("NO_CHANGE");

      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).walletBalance).toBe(0);
      expect(captureMessage).not.toHaveBeenCalled();
    });
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

  /**
   * Finding 1a — the mirror image of the withdrawal case above, and the one that cannot be corrected.
   *
   * Failing a payout reopens the claim, which is deliberate: the ordinary FAILED row is a transfer that
   * never left. But when the provider later says that same reference was paid, the champion has already
   * been free to claim again with a fresh reference — so there may be two completed payouts for one prize
   * and no balance anywhere to take the second one back out of. All this can do is stop lying: the row
   * moves to COMPLETE and a person is told, with enough in the alert to see whether it happened twice.
   *
   * Nothing else would ever have noticed. The sweep asks only about PENDING rows, and the route treats
   * only PENDING and COMPLETE as claimed, so a FAILED row was the one state neither of them looked at.
   */
  describe("a prize payout that failed and then turned out to have succeeded", () => {
    /** A payout the provider refused — so the row is FAILED and the champion is free to claim again. */
    async function failedPayout(amount = 100_000) {
      const organizer = await createTestOrganizer();
      const winner = await createTestUser();
      const tournament = await createTestTournament(organizer.id, { status: "COMPLETE", prizeAmount: amount });
      const reference = `test-payout-${uniqueSuffix()}`;
      await prisma.escrowTransaction.create({
        data: { tournamentId: tournament.id, type: "PRIZE_PAYOUT", amount, userId: winner.id, place: 1, provider: "PAYSTACK", providerRef: reference, status: "FAILED" },
      });
      vi.mocked(captureMessage).mockClear();
      return { tournament, winner, reference };
    }

    it("stops claiming the prize never went out", async () => {
      const { reference } = await failedPayout();

      expect(await applyTransferOutcome(reference, "SUCCESS")).toBe("APPLIED");

      const row = await prisma.escrowTransaction.findUniqueOrThrow({ where: { providerRef: reference } });
      expect(row.status).toBe("COMPLETE");
    });

    it("alerts, because the money is already in the champion's bank and only a person can settle that", async () => {
      const { tournament, winner, reference } = await failedPayout();

      await applyTransferOutcome(reference, "SUCCESS");

      expect(captureMessage).toHaveBeenCalledWith(
        "Prize payout succeeded after it was marked failed",
        "error",
        expect.objectContaining({ tournamentId: tournament.id, userId: winner.id, amount: 100_000, playerPaidTwice: false })
      );
    });

    it("says how much was paid twice when the champion's second claim had already completed", async () => {
      // The whole of finding 1a, end to end: the first transfer is marked FAILED, the champion claims
      // again and that one completes, and only then does the first reference come back as paid.
      const { tournament, winner, reference } = await failedPayout();
      await prisma.escrowTransaction.create({
        data: { tournamentId: tournament.id, type: "PRIZE_PAYOUT", amount: 100_000, userId: winner.id, place: 1, provider: "PAYSTACK", providerRef: `test-payout-${uniqueSuffix()}`, status: "COMPLETE" },
      });

      await applyTransferOutcome(reference, "SUCCESS");

      expect(captureMessage).toHaveBeenCalledWith(
        "Prize payout succeeded after it was marked failed",
        "error",
        expect.objectContaining({ playerPaidTwice: true, otherPayoutsForTournament: 1, otherPayoutsKobo: 100_000 })
      );
    });

    it("counts only this champion's payouts for this tournament", async () => {
      // The count is what turns "something is off" into "this player was paid twice", so it has to be
      // scoped to the pair — another tournament's winner completing a payout is ordinary, not evidence.
      const { winner, reference } = await failedPayout();
      const otherOrganizer = await createTestOrganizer();
      const otherTournament = await createTestTournament(otherOrganizer.id, { status: "COMPLETE", prizeAmount: 100_000 });
      await prisma.escrowTransaction.create({
        data: { tournamentId: otherTournament.id, type: "PRIZE_PAYOUT", amount: 100_000, userId: winner.id, place: 1, provider: "PAYSTACK", providerRef: `test-payout-${uniqueSuffix()}`, status: "COMPLETE" },
      });

      await applyTransferOutcome(reference, "SUCCESS");

      expect(captureMessage).toHaveBeenCalledWith(
        "Prize payout succeeded after it was marked failed",
        "error",
        expect.objectContaining({ playerPaidTwice: false, otherPayoutsForTournament: 0 })
      );
    });

    it("records it exactly once, however many times the webhook arrives", async () => {
      const { reference } = await failedPayout();

      await Promise.all([
        applyTransferOutcome(reference, "SUCCESS"),
        applyTransferOutcome(reference, "SUCCESS"),
        applyTransferOutcome(reference, "SUCCESS"),
      ]);

      const row = await prisma.escrowTransaction.findUniqueOrThrow({ where: { providerRef: reference } });
      expect(row.status).toBe("COMPLETE");
      expect(captureMessage).toHaveBeenCalledTimes(1);
    });

    it("does nothing to a payout that is already complete", async () => {
      // The ordinary replay, and the reason the FAILED check exists rather than a bare compare-and-swap:
      // a second SUCCESS on a COMPLETE row must not look like a second payment.
      const { tournament, winner } = await failedPayout();
      const reference = `test-payout-${uniqueSuffix()}`;
      await prisma.escrowTransaction.create({
        data: { tournamentId: tournament.id, type: "PRIZE_PAYOUT", amount: 100_000, userId: winner.id, place: 1, provider: "PAYSTACK", providerRef: reference, status: "PENDING" },
      });
      await applyTransferOutcome(reference, "SUCCESS");
      vi.mocked(captureMessage).mockClear();

      expect(await applyTransferOutcome(reference, "SUCCESS")).toBe("NO_CHANGE");

      expect(captureMessage).not.toHaveBeenCalled();
    });

    it("leaves a failed payout failed when the provider fails it again", async () => {
      // The retry loop finding #17 bounds: the same FAILED answer, arriving again, changes nothing.
      const { reference } = await failedPayout();

      expect(await applyTransferOutcome(reference, "FAILED")).toBe("NO_CHANGE");

      expect(captureMessage).not.toHaveBeenCalled();
    });
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

/**
 * Finding #20, the half that was silent. The sweep settles what it can and reports what throws, but a transfer
 * the provider keeps answering PENDING about did neither — the row stayed PENDING, the sweep asked again two
 * minutes later, and money that had left a player's wallet showed up only as a count on a page somebody had to
 * think to open. These tests are about the alert that closes that gap, and about it not becoming its own noise.
 */
describe("stuck money (finding #20)", () => {
  /** A withdrawal aged past the alert threshold, with the provider still saying PENDING about it. */
  async function stuckWithdrawal(ageMs: number, amount = 50_000) {
    const row = await pendingWithdrawal(amount);
    await prisma.walletTransaction.updateMany({
      where: { providerRef: row.reference },
      data: { createdAt: new Date(Date.now() - ageMs) },
    });
    vi.spyOn(paystackClient, "verifyTransfer").mockResolvedValue("PENDING");
    return row;
  }

  it("alerts once money has been out for a day", async () => {
    await stuckWithdrawal(25 * 60 * 60_000, 50_000);

    const result = await reconcilePendingMoney();

    expect(captureMessage).toHaveBeenCalledWith(STUCK_ALERT, "error", expect.objectContaining({ withdrawals: 1, withdrawalsKobo: 50_000 }));
    expect(result.stuckMoney).toBe(1);
  });

  it("stays quiet while a transfer is merely slow", async () => {
    // The same row, still inside the day. A bank transfer that takes an afternoon is not an incident, and an
    // alert that fires for one is an alert nobody reads by the time it matters.
    await stuckWithdrawal(45 * 60_000);

    const result = await reconcilePendingMoney();

    expect(captureMessage).not.toHaveBeenCalledWith(STUCK_ALERT, "error", expect.anything());
    expect(result.stuckMoney).toBe(0);
  });

  it("does not repeat itself every two minutes for as long as the money is stuck", async () => {
    // The sweep runs every two minutes; a transfer stuck for a week is ~5000 runs. One alert every six hours
    // keeps it in front of somebody without training them to filter the channel out.
    await stuckWithdrawal(25 * 60 * 60_000);

    await reconcilePendingMoney();
    await reconcilePendingMoney();
    await reconcilePendingMoney();

    expect(vi.mocked(captureMessage).mock.calls.filter(([message]) => message === STUCK_ALERT)).toHaveLength(1);
  });

  it("counts every stuck transfer, not just the ones this run's batch reached", async () => {
    // The alert is deliberately not bounded by RECONCILE_BATCH: the size of the backlog is what decides who
    // looks at it, and money the batch never got to is exactly the money nobody would otherwise see.
    await stuckWithdrawal(25 * 60 * 60_000, 30_000);
    await stuckWithdrawal(25 * 60 * 60_000, 70_000);

    const result = await reconcilePendingMoney();

    expect(captureMessage).toHaveBeenCalledWith(STUCK_ALERT, "error", expect.objectContaining({ withdrawals: 2, withdrawalsKobo: 100_000 }));
    expect(result.stuckMoney).toBe(2);
  });
});
