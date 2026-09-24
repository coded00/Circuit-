/**
 * Circuit — entry-fee payment confirmation (Build Plan P2-2, maps: REG-2).
 *
 * The single place both the redirect callback (best-effort, the browser
 * might never come back) and the provider webhook (authoritative, but
 * replay-prone) funnel into. Never trusts a webhook's own payload for the
 * payment's status — always re-verifies against the provider's API by
 * reference, and is idempotent: calling this twice for the same reference
 * is safe because it only acts while the registration is still
 * PENDING_PAYMENT.
 */

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { getPaymentProvider } from "@/lib/payments";
import { maybeGenerateBracketOnCapFill } from "@/lib/matches";
import { computePlatformFee } from "@/lib/platformFee";
import { trackEvent } from "@/lib/analytics";

export async function confirmEntryFeePayment(reference: string): Promise<void> {
  const registration = await prisma.registration.findUnique({
    where: { paymentRef: reference },
    include: { tournament: true, escrowTxns: true },
  });
  if (!registration || registration.status !== "PENDING_PAYMENT") {
    // Unknown reference, or already processed by an earlier call — a
    // webhook retry/replay lands here too, and both are a safe no-op.
    return;
  }

  const escrowTxn = registration.escrowTxns.find(
    (txn) => txn.type === "ENTRY_FEE" && txn.providerRef === reference
  );
  if (!escrowTxn) return;

  const provider = getPaymentProvider(escrowTxn.provider!); // always set for an ENTRY_FEE row
  const result = await provider.verifyCharge(reference);

  if (result.status !== "SUCCESS" || result.amount !== registration.tournament.entryFee) {
    if (result.status === "FAILED") {
      await prisma.escrowTransaction.update({
        where: { id: escrowTxn.id },
        data: { status: "FAILED" },
      });
    }
    return;
  }

  trackEvent("payment_verified", {
    userId: registration.userId,
    tournamentId: registration.tournamentId,
    game: registration.tournament.game,
    amountMinor: result.amount,
    currency: "NGN",
  });

  // Read outside the transaction — this rate rarely changes, and a
  // registration landing on the old vs. new rate in the rare case an
  // admin changes it in the exact instant this is running is not a
  // correctness issue worth another query inside the transaction below.
  const platformSetting = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  const feeAmount = computePlatformFee(registration.tournament.entryFee, platformSetting?.platformFeeBps ?? 0);

  const confirmed = await prisma.$transaction(async (tx) => {
    // The top-of-function `status !== "PENDING_PAYMENT"` read is only a
    // fast-path check, taken before the slow provider.verifyCharge() call
    // above — not the actual guard (same reasoning as
    // confirmWalletFunding's own comment). This conditional update is the
    // real one: it's the single point that decides whether THIS call gets
    // to create the PLATFORM_FEE/ORGANIZER_REVENUE rows below. Without
    // it, a webhook delivery racing the redirect-callback page's poll
    // (both funnel into this function, per this file's header comment)
    // could both pass the fast-path read and both create those rows —
    // double-crediting the organizer for one entry fee.
    const claimed = await tx.registration.updateMany({
      where: { id: registration.id, status: "PENDING_PAYMENT" },
      data: { status: "CONFIRMED" },
    });
    if (claimed.count === 0) return "ALREADY_HANDLED" as const;

    // Counted AFTER claiming this registration (it's already CONFIRMED
    // above), so this row counts itself — `>` here is the same check as
    // the original `confirmedCount >= cap` taken before confirming.
    const confirmedCount = await tx.registration.count({
      where: { tournamentId: registration.tournamentId, status: "CONFIRMED" },
    });

    if (confirmedCount > registration.tournament.participantCap) {
      // The slot was filled by a concurrent payment while this charge was processing.
      // Refuse confirmation and mark for refund.
      await tx.registration.update({
        where: { id: registration.id },
        data: { status: "REFUNDED" },
      });
      await tx.escrowTransaction.update({
        where: { id: escrowTxn.id },
        data: { status: "FAILED" },
      });
      return "OVER_CAPACITY" as const;
    }

    await tx.escrowTransaction.update({
      where: { id: escrowTxn.id },
      data: { status: "COMPLETE" },
    });
    // Carved out of the entry fee that already arrived, not charged on
    // top of it — see PLATFORM_FEE's own schema comment. Same
    // transaction as the entry-fee confirmation itself: never recorded
    // without it, never missing when it succeeds.
    if (feeAmount > 0) {
      await tx.escrowTransaction.create({
        data: {
          tournamentId: registration.tournamentId,
          registrationId: registration.id,
          type: "PLATFORM_FEE",
          amount: feeAmount,
          status: "COMPLETE",
        },
      });
    }
    // The organizer's own cut — the remainder after the platform fee, in
    // full. Starts PENDING: settleOrganizerRevenue() (src/lib/
    // settlement.ts) credits it to the organizer's wallet once this
    // tournament's settlement window passes with no open dispute or
    // funds freeze — see ORGANIZER_REVENUE's own schema comment.
    const organizerRevenueAmount = registration.tournament.entryFee - feeAmount;
    if (organizerRevenueAmount > 0) {
      await tx.escrowTransaction.create({
        data: {
          tournamentId: registration.tournamentId,
          registrationId: registration.id,
          userId: registration.tournament.organizerId,
          type: "ORGANIZER_REVENUE",
          amount: organizerRevenueAmount,
          status: "PENDING",
        },
      });
    }
    return "CONFIRMED" as const;
  });

  if (confirmed === "ALREADY_HANDLED") {
    // A concurrent call already confirmed (or refunded) this exact
    // registration — its own success/refund path already ran once.
    // Nothing left for this call to do.
    return;
  }

  if (confirmed === "OVER_CAPACITY") {
    // Automatically issue the gateway refund so the player's funds are returned
    try {
      await provider.refundCharge(reference, registration.tournament.entryFee);
    } catch (refundErr) {
      console.error(`[payment] Failed to auto-refund over-capacity payment for reference ${reference}:`, refundErr);
    }
    await notify(registration.userId, "REGISTRATION_CLOSED", {
      tournamentId: registration.tournamentId,
    });
    return;
  }

  trackEvent("tournament_joined", {
    userId: registration.userId,
    tournamentId: registration.tournamentId,
    game: registration.tournament.game,
    amountMinor: registration.tournament.entryFee,
  });

  await notify(registration.userId, "REGISTRATION_CONFIRMED", {
    tournamentId: registration.tournamentId,
  });

  await maybeGenerateBracketOnCapFill(registration.tournamentId); // BRK-1's cap-fill path
}

/**
 * Wallet-funding confirmation — same shape and same discipline as
 * confirmEntryFeePayment above: never trusts the webhook payload, always
 * re-verifies by reference against the provider, and only acts while the
 * transaction is still PENDING (idempotent against webhook replays and
 * the best-effort redirect callback both landing on the same reference).
 */
export async function confirmWalletFunding(reference: string): Promise<void> {
  const txn = await prisma.walletTransaction.findUnique({ where: { providerRef: reference } });
  if (!txn || txn.type !== "FUND" || txn.status !== "PENDING") {
    return;
  }

  const provider = getPaymentProvider(txn.provider!);
  const result = await provider.verifyCharge(reference);

  if (result.status !== "SUCCESS" || result.amount !== txn.amount) {
    if (result.status === "FAILED") {
      await prisma.walletTransaction.update({ where: { id: txn.id }, data: { status: "FAILED" } });
    }
    return;
  }

  // The "still PENDING" check above is only a fast-path read, taken before
  // the (slow) provider call — not the actual guard. Two calls for the same
  // reference (a webhook retry racing the redirect callback, or two webhook
  // deliveries) could both pass that read before either commits. The real
  // guard is this conditional update: only the call that actually flips
  // PENDING→COMPLETE gets to increment the balance, so a genuine race
  // credits the wallet once, not twice.
  await prisma.$transaction(async (tx) => {
    const updated = await tx.walletTransaction.updateMany({
      where: { id: txn.id, status: "PENDING" },
      data: { status: "COMPLETE" },
    });
    if (updated.count === 0) return; // a concurrent call already credited this reference

    await tx.user.update({ where: { id: txn.userId }, data: { walletBalance: { increment: txn.amount } } });
  });
}
