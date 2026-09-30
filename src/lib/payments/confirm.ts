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
 *
 * A charge can also complete after it stopped being the registration's
 * current checkout: the player withdrew while it was processing, or
 * started a fresh checkout (the registration row is reused and its
 * paymentRef overwritten), or already got in with another payment. That
 * money is refunded once (refundOrphanedCharge below). Lookups go by the
 * ENTRY_FEE row's own providerRef, not the registration's paymentRef, so
 * a superseded reference is still found.
 */

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { getPaymentProvider } from "@/lib/payments";
import { maybeGenerateBracketOnCapFill } from "@/lib/matches";
import { computePlatformFee } from "@/lib/platformFee";
import { trackEvent } from "@/lib/analytics";
import { notifyRoster } from "@/lib/teamEntries";
import { captureException } from "@/lib/observability";
import { issueEntryFeeRefund } from "@/lib/payments/transfers";
import { lockTournament } from "@/lib/registrationCapacity";
import { assertInGameNamesFree, InGameNameTakenError } from "@/lib/inGameNames";

export async function confirmEntryFeePayment(reference: string): Promise<void> {
  const escrowTxn = await prisma.escrowTransaction.findUnique({
    where: { providerRef: reference },
    include: { registration: { include: { tournament: true } } },
  });
  // Unknown reference, or already processed by an earlier call — a
  // webhook retry/replay lands here too, and both are a safe no-op.
  if (!escrowTxn || escrowTxn.type !== "ENTRY_FEE" || escrowTxn.status !== "PENDING" || !escrowTxn.registration) return;
  const registration = escrowTxn.registration;

  if (registration.status !== "PENDING_PAYMENT" || registration.paymentRef !== reference) {
    await refundOrphanedCharge(escrowTxn.id, reference);
    return;
  }

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
    //
    // The tournament lock makes two payments for the last slot take turns,
    // so the count below sees the other one (src/lib/registrationCapacity.ts).
    await lockTournament(tx, registration.tournamentId);
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

    // The name was free when checkout started; someone else may have taken it
    // while this payment was processing. Only confirmed entries count here.
    const rosterNames = await tx.rosterMember.findMany({
      where: { registrationId: registration.id, userId: { not: registration.userId } },
      select: { inGameId: true },
    });
    try {
      await assertInGameNamesFree(tx, registration.tournamentId, registration.userId, [registration.inGameId, ...rosterNames.map((r) => r.inGameId)], { confirmedOnly: true });
    } catch (err) {
      if (!(err instanceof InGameNameTakenError)) throw err;
      await tx.registration.update({ where: { id: registration.id }, data: { status: "REFUNDED" } });
      await tx.escrowTransaction.update({ where: { id: escrowTxn.id }, data: { status: "FAILED" } });
      return "NAME_TAKEN" as const;
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

  if (confirmed === "NAME_TAKEN") {
    try {
      await issueEntryFeeRefund({
        tournamentId: registration.tournamentId,
        registrationId: registration.id,
        provider: escrowTxn.provider!,
        chargeRef: reference,
        amount: result.amount,
      });
    } catch (refundErr) {
      captureException(refundErr, { source: "confirmEntryFeePayment", reason: "name-taken refund", reference });
    }
    await notify(registration.userId, "REGISTRATION_NAME_TAKEN", {
      tournamentId: registration.tournamentId,
      tournamentName: registration.tournament.name,
      inGameName: registration.inGameId,
    });
    return;
  }

  if (confirmed === "OVER_CAPACITY") {
    // Automatically issue the gateway refund so the player's funds are returned
    try {
      await issueEntryFeeRefund({
        tournamentId: registration.tournamentId,
        registrationId: registration.id,
        provider: escrowTxn.provider!,
        chargeRef: reference,
        amount: result.amount,
      });
    } catch (refundErr) {
      captureException(refundErr, { source: "confirmEntryFeePayment", reason: "over-capacity refund", reference });
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

  // Team entry: the rest of the roster hears they're in.
  await notifyRoster(registration.id).catch(() => undefined);
  await notify(registration.userId, "REGISTRATION_CONFIRMED", {
    tournamentId: registration.tournamentId,
  });

  await maybeGenerateBracketOnCapFill(registration.tournamentId); // BRK-1's cap-fill path
}

/**
 * A paid entry fee that no longer belongs to an active checkout (see the
 * header comment): mark it received, refund it, tell the player. The
 * escrow row's PENDING → COMPLETE flip is the claim, so a webhook and the
 * sweep can't both refund. If the refund call throws, the claim is undone
 * and the sweep (reconcilePendingMoney) tries again later.
 */
async function refundOrphanedCharge(escrowTxnId: string, reference: string): Promise<void> {
  const escrowTxn = await prisma.escrowTransaction.findUniqueOrThrow({
    where: { id: escrowTxnId },
    include: { registration: { include: { tournament: { select: { id: true, name: true } } } } },
  });
  const provider = getPaymentProvider(escrowTxn.provider!);
  const result = await provider.verifyCharge(reference);
  if (result.status === "FAILED") {
    await prisma.escrowTransaction.updateMany({ where: { id: escrowTxn.id, status: "PENDING" }, data: { status: "FAILED" } });
    return;
  }
  if (result.status !== "SUCCESS") return;

  const claimed = await prisma.escrowTransaction.updateMany({ where: { id: escrowTxn.id, status: "PENDING" }, data: { status: "COMPLETE" } });
  if (claimed.count === 0) return;

  try {
    await issueEntryFeeRefund({
      tournamentId: escrowTxn.tournamentId!,
      registrationId: escrowTxn.registrationId!,
      provider: escrowTxn.provider!,
      chargeRef: reference,
      amount: result.amount,
    });
  } catch (err) {
    await prisma.escrowTransaction.update({ where: { id: escrowTxn.id }, data: { status: "PENDING" } });
    throw err;
  }
  // A withdrawn player's registration now reads as refunded. One that's
  // CONFIRMED (paid twice) or mid-checkout again is left alone.
  await prisma.registration.updateMany({ where: { id: escrowTxn.registrationId!, status: "WITHDRAWN" }, data: { status: "REFUNDED" } });
  const tournament = escrowTxn.registration?.tournament;
  await notify(escrowTxn.registration!.userId, "PAYMENT_REFUNDED", {
    tournamentId: tournament?.id,
    tournamentName: tournament?.name,
    amount: result.amount,
  }).catch(() => undefined);
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
