/**
 * Circuit — what happens after money leaves: transfer and refund outcomes.
 *
 * A withdrawal or prize payout is a Paystack transfer, and a transfer is
 * often still "pending" when initiateTransfer returns. Its real outcome
 * arrives later, as a `transfer.success` / `transfer.failed` /
 * `transfer.reversed` webhook, and applyTransferOutcome() records it:
 *
 * - success → the row goes COMPLETE.
 * - failed or reversed → the row goes FAILED. A withdrawal's money goes
 *   back into the wallet; a prize payout can be claimed again (the payout
 *   route treats a FAILED row as unclaimed). A reversal can follow a
 *   success, so COMPLETE rows are reversible too.
 *
 * Every change is a compare-and-swap on the row's status, so a webhook
 * replay, the webhook racing the sweep, or the webhook racing the route
 * that initiated the transfer all apply an outcome once — the wallet is
 * credited back exactly once.
 *
 * Refunds get the same treatment: issueEntryFeeRefund() records a REFUND
 * row before calling the provider (so a fast `refund.processed` webhook
 * always has a row to land on), and applyRefundOutcome() settles it.
 *
 * reconcilePendingMoney() is the sweep's backstop for webhooks that never
 * arrive: it asks the provider directly about transfers still pending
 * after 30 minutes, and catches entry fees paid after the player withdrew.
 */

import type { PaymentProviderName } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { getPaymentProvider } from "@/lib/payments";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";
import { captureException, captureMessage } from "@/lib/observability";
import type { TransferStatus } from "./types";

export type TransferOutcome = Exclude<TransferStatus, "PENDING">;

/**
 * A REFUND row's providerRef. It can't be the charge reference itself —
 * the ENTRY_FEE row already holds that and providerRef is unique, which
 * used to make recording a refund fail after the money had gone back.
 */
export const refundRef = (chargeRef: string) => `refund_${chargeRef}`;

/** A charge reference for an entry fee paid from the wallet (see the registrations route). */
const WALLET_ENTRY_PREFIX = "wallet_entry_";

/** Records a transfer's final outcome, by our own reference. Safe to call repeatedly. */
export async function applyTransferOutcome(reference: string, outcome: TransferOutcome): Promise<"APPLIED" | "NO_CHANGE" | "UNKNOWN"> {
  const withdrawal = await prisma.walletTransaction.findUnique({ where: { providerRef: reference } });
  if (withdrawal && withdrawal.type === "WITHDRAWAL") {
    if (outcome === "SUCCESS") {
      const done = await prisma.walletTransaction.updateMany({ where: { id: withdrawal.id, status: "PENDING" }, data: { status: "COMPLETE" } });
      if (done.count === 0 && withdrawal.status === "FAILED") {
        // We gave the balance back (the transfer call errored) but the money went out anyway.
        captureMessage("Withdrawal succeeded after it was marked failed and refunded to the wallet", "error", {
          walletTransactionId: withdrawal.id,
          userId: withdrawal.userId,
          amount: withdrawal.amount,
        });
      }
      return done.count ? "APPLIED" : "NO_CHANGE";
    }
    const returned = await prisma.$transaction(async (tx) => {
      const flipped = await tx.walletTransaction.updateMany({
        where: { id: withdrawal.id, status: { in: ["PENDING", "COMPLETE"] } },
        data: { status: "FAILED" },
      });
      if (flipped.count === 0) return false;
      await tx.user.update({ where: { id: withdrawal.userId }, data: { walletBalance: { increment: withdrawal.amount } } });
      return true;
    });
    if (!returned) return "NO_CHANGE";
    captureMessage(`Withdrawal ${outcome === "REVERSED" ? "reversed" : "failed"}; balance returned`, "warning", {
      walletTransactionId: withdrawal.id,
      userId: withdrawal.userId,
      amount: withdrawal.amount,
    });
    await notify(withdrawal.userId, "WITHDRAWAL_RETURNED", { amount: withdrawal.amount }).catch(() => undefined);
    return "APPLIED";
  }

  const payout = await prisma.escrowTransaction.findUnique({ where: { providerRef: reference } });
  if (payout && payout.type === "PRIZE_PAYOUT") {
    const flipped = await prisma.escrowTransaction.updateMany({
      where: { id: payout.id, status: outcome === "SUCCESS" ? "PENDING" : { in: ["PENDING", "COMPLETE"] } },
      data: { status: outcome === "SUCCESS" ? "COMPLETE" : "FAILED" },
    });
    if (flipped.count === 0) return "NO_CHANGE";
    if (outcome !== "SUCCESS") {
      captureMessage(`Prize payout ${outcome === "REVERSED" ? "reversed" : "failed"}; claim reopened`, "warning", {
        escrowTransactionId: payout.id,
        tournamentId: payout.tournamentId,
        userId: payout.userId,
        amount: payout.amount,
      });
      if (payout.userId && payout.tournamentId) {
        const tournament = await prisma.tournament.findUnique({ where: { id: payout.tournamentId }, select: { name: true } });
        await notify(payout.userId, "PRIZE_PAYOUT_FAILED", {
          tournamentId: payout.tournamentId,
          tournamentName: tournament?.name,
          amount: payout.amount,
        }).catch(() => undefined);
      }
    }
    return "APPLIED";
  }

  return "UNKNOWN";
}

/**
 * Refunds a paid entry fee and records it. The REFUND row is written first
 * (PENDING) so the refund webhook always finds it; if the provider call
 * throws, nothing went out and the row is removed so a retry can record a
 * fresh one. Returns the recorded status.
 */
/**
 * The entry fee a registration currently holds: paid, and not yet refunded.
 * A player who withdraws and joins again keeps one registration that carries
 * every payment they've made, so "the paid ENTRY_FEE row" alone may be an old,
 * already-refunded one.
 */
export function currentPaidEntryFee<T extends { type: string; status: string; providerRef: string | null; createdAt: Date }>(txns: T[]): T | undefined {
  const refunded = new Set(txns.filter((t) => t.type === "REFUND").map((t) => t.providerRef));
  return txns
    .filter((t) => t.type === "ENTRY_FEE" && t.status === "COMPLETE" && t.providerRef && !refunded.has(refundRef(t.providerRef)))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

/**
 * Takes back the platform fee and the organizer's share carved out of an
 * entry fee that has just been refunded. Left alone, the organizer would still
 * be paid their share when the tournament settles, and the fee would still
 * count as earned.
 */
export async function voidEntryFeeRevenue(registrationId: string): Promise<void> {
  await prisma.escrowTransaction.updateMany({ where: { registrationId, type: "PLATFORM_FEE", status: "COMPLETE" }, data: { status: "FAILED" } });
  await prisma.escrowTransaction.updateMany({ where: { registrationId, type: "ORGANIZER_REVENUE", status: "PENDING" }, data: { status: "FAILED" } });
}

export async function issueEntryFeeRefund(input: {
  tournamentId: string;
  registrationId: string;
  provider: PaymentProviderName;
  chargeRef: string;
  amount: number;
  /** Tell the player about it. Off by default: cancellations and late-payment refunds send their own message. */
  notifyPlayer?: boolean;
}): Promise<"COMPLETE" | "PENDING"> {
  const registration = await prisma.registration.findUnique({
    where: { id: input.registrationId },
    select: { userId: true, tournament: { select: { id: true, name: true } } },
  });
  const message = { tournamentId: input.tournamentId, tournamentName: registration?.tournament.name, amount: input.amount };

  // Paid from the wallet: Paystack never saw this payment, so there's
  // nothing to refund there. The money goes back into the wallet.
  if (input.chargeRef.startsWith(WALLET_ENTRY_PREFIX)) {
    if (!registration) throw new Error(`No registration ${input.registrationId} to refund into a wallet`);
    await prisma.$transaction(async (tx) => {
      await tx.escrowTransaction.create({
        data: {
          tournamentId: input.tournamentId,
          registrationId: input.registrationId,
          type: "REFUND",
          amount: input.amount,
          provider: input.provider,
          providerRef: refundRef(input.chargeRef),
          status: "COMPLETE",
        },
      });
      await tx.user.update({ where: { id: registration.userId }, data: { walletBalance: { increment: input.amount } } });
      await tx.walletTransaction.create({
        data: {
          userId: registration.userId,
          type: "ENTRY_FEE_REFUND",
          amount: input.amount,
          provider: input.provider,
          providerRef: refundRef(input.chargeRef),
          status: "COMPLETE",
        },
      });
    });
    if (input.notifyPlayer && registration) {
      await notify(registration.userId, "ENTRY_FEE_REFUND", { ...message, stage: "WALLET" }).catch(() => undefined);
    }
    return "COMPLETE";
  }

  const row = await prisma.escrowTransaction.create({
    data: {
      tournamentId: input.tournamentId,
      registrationId: input.registrationId,
      type: "REFUND",
      amount: input.amount,
      provider: input.provider,
      providerRef: refundRef(input.chargeRef),
      status: "PENDING",
    },
  });
  let result;
  try {
    result = await getPaymentProvider(input.provider).refundCharge(input.chargeRef, input.amount);
  } catch (err) {
    await prisma.escrowTransaction.delete({ where: { id: row.id } }).catch(() => undefined);
    throw err;
  }
  if (result.status === "SUCCESS") {
    await prisma.escrowTransaction.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "COMPLETE" } });
  }
  if (input.notifyPlayer && registration) {
    await notify(registration.userId, "ENTRY_FEE_REFUND", { ...message, stage: result.status === "SUCCESS" ? "DONE" : "STARTED" }).catch(() => undefined);
  }
  return result.status === "SUCCESS" ? "COMPLETE" : "PENDING";
}

/** Records a refund's outcome from the provider, by the original charge's reference. */
export async function applyRefundOutcome(chargeRef: string, outcome: "SUCCESS" | "FAILED"): Promise<"APPLIED" | "NO_CHANGE" | "UNKNOWN"> {
  const row = await prisma.escrowTransaction.findUnique({
    where: { providerRef: refundRef(chargeRef) },
    include: { registration: { select: { userId: true, tournament: { select: { id: true, name: true } } } } },
  });
  if (!row || row.type !== "REFUND") return "UNKNOWN";
  const flipped = await prisma.escrowTransaction.updateMany({
    where: { id: row.id, status: "PENDING" },
    data: { status: outcome === "SUCCESS" ? "COMPLETE" : "FAILED" },
  });
  if (flipped.count && outcome === "FAILED") {
    // No automatic retry — a refund the provider refused needs a person. It
    // shows on the admin Overview under "Refunds that failed".
    captureMessage("Entry-fee refund failed at the provider", "error", {
      escrowTransactionId: row.id,
      tournamentId: row.tournamentId,
      registrationId: row.registrationId,
      amount: row.amount,
    });
  }
  if (flipped.count && row.registration) {
    await notify(row.registration.userId, "ENTRY_FEE_REFUND", {
      tournamentId: row.registration.tournament.id,
      tournamentName: row.registration.tournament.name,
      amount: row.amount,
      stage: outcome === "SUCCESS" ? "DONE" : "FAILED",
    }).catch(() => undefined);
  }
  return flipped.count ? "APPLIED" : "NO_CHANGE";
}

const TRANSFER_STALE_MS = 30 * 60_000;
/** How long a transfer can stay PENDING before it stops looking like a slow bank and starts needing a person. */
const TRANSFER_STUCK_MS = 24 * 60 * 60_000;
/** How often that alert is allowed to repeat while the money is still stuck. */
const STUCK_ALERT_REPEAT_MS = 6 * 60 * 60_000;
/** The key that budget is spent against — one shared alert, not one per row. */
const STUCK_ALERT_KEY = "money-alert:transfers-stuck";
const LATE_PAYMENT_MIN_AGE_MS = 15 * 60_000;
const LATE_PAYMENT_MAX_AGE_MS = 3 * 24 * 60 * 60_000; // an abandoned checkout never resolves; stop asking
const RECONCILE_BATCH = 25;

/**
 * Sweep backstop (runScheduledSweep): asks the provider about transfers
 * still pending after 30 minutes, and re-checks entry fees whose player
 * withdrew or re-checked-out before the payment finished
 * (confirmEntryFeePayment refunds them if the charge went through).
 */
export async function reconcilePendingMoney(): Promise<{
  transfersSettled: number;
  latePaymentsChecked: number;
  /** Transfers still PENDING after a day, whether or not this run got to alert about them. */
  stuckMoney: number;
}> {
  const staleBefore = new Date(Date.now() - TRANSFER_STALE_MS);
  const [withdrawals, payouts] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { type: "WITHDRAWAL", status: "PENDING", createdAt: { lt: staleBefore }, providerRef: { not: null }, provider: { not: null } },
      select: { providerRef: true, provider: true },
      orderBy: { createdAt: "asc" },
      take: RECONCILE_BATCH,
    }),
    prisma.escrowTransaction.findMany({
      where: { type: "PRIZE_PAYOUT", status: "PENDING", createdAt: { lt: staleBefore }, providerRef: { not: null }, provider: { not: null } },
      select: { providerRef: true, provider: true },
      orderBy: { createdAt: "asc" },
      take: RECONCILE_BATCH,
    }),
  ]);

  let transfersSettled = 0;
  for (const row of [...withdrawals, ...payouts]) {
    try {
      const status = await getPaymentProvider(row.provider!).verifyTransfer(row.providerRef!);
      if (status === "PENDING") continue;
      if ((await applyTransferOutcome(row.providerRef!, status)) === "APPLIED") transfersSettled++;
    } catch (err) {
      captureException(err, { source: "reconcilePendingMoney", reference: row.providerRef });
    }
  }

  // Imported lazily: confirm.ts → matches.ts → (sweep) → this file.
  const { confirmEntryFeePayment } = await import("./confirm");
  const now = Date.now();
  // Entry fees that are no longer the registration's live checkout: the
  // player withdrew, got in some other way, or started a fresh checkout
  // (which overwrites paymentRef). A live checkout is left to its own
  // callback and webhook.
  const pendingFees = await prisma.escrowTransaction.findMany({
    where: {
      type: "ENTRY_FEE",
      status: "PENDING",
      providerRef: { not: null },
      createdAt: { lt: new Date(now - LATE_PAYMENT_MIN_AGE_MS), gt: new Date(now - LATE_PAYMENT_MAX_AGE_MS) },
    },
    select: { providerRef: true, registration: { select: { status: true, paymentRef: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const latePayments = pendingFees
    .filter((row) => row.registration && (row.registration.status !== "PENDING_PAYMENT" || row.registration.paymentRef !== row.providerRef))
    .slice(0, RECONCILE_BATCH);
  for (const row of latePayments) {
    try {
      await confirmEntryFeePayment(row.providerRef!);
    } catch (err) {
      captureException(err, { source: "reconcilePendingMoney", reference: row.providerRef });
    }
  }

  // Finding #20. The loop above settles what it can, and a throw is reported as it happens — but a transfer
  // the provider keeps answering PENDING about was silent. The row stayed PENDING, the sweep asked about it
  // again two minutes later, and the only trace of money that had left a player's wallet was a count on a
  // page somebody had to think to open. A bank transfer that is still going a day later is not a slow bank:
  // it is somebody's money waiting on somebody at Circuit, so it gets an alert of its own.
  //
  // The alert is deliberately about the whole backlog rather than one row — what decides who looks at this
  // now is how much is stuck, not which transfer it is — and it is spent against the rate limiter's own
  // keyed budget rather than a new column, because "at most once per window" is exactly the shape that
  // table already has. Six hours is the compromise: a genuinely stuck transfer stays in front of somebody,
  // and one unlucky payout cannot become a message every two minutes for as long as it lasts.
  const stuckBefore = new Date(Date.now() - TRANSFER_STUCK_MS);
  const [stuckWithdrawals, stuckPayouts] = await Promise.all([
    prisma.walletTransaction.aggregate({
      where: { type: "WITHDRAWAL", status: "PENDING", createdAt: { lt: stuckBefore } },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.escrowTransaction.aggregate({
      where: { type: "PRIZE_PAYOUT", status: "PENDING", createdAt: { lt: stuckBefore } },
      _count: true,
      _sum: { amount: true },
    }),
  ]);
  const stuckCount = stuckWithdrawals._count + stuckPayouts._count;
  if (stuckCount > 0) {
    const { limited } = await isRateLimited(STUCK_ALERT_KEY, { max: 1, windowMs: STUCK_ALERT_REPEAT_MS });
    if (!limited) {
      await recordAttempt(STUCK_ALERT_KEY);
      captureMessage("Money stuck: transfers still pending after a day", "error", {
        withdrawals: stuckWithdrawals._count,
        withdrawalsKobo: stuckWithdrawals._sum.amount ?? 0,
        prizePayouts: stuckPayouts._count,
        prizePayoutsKobo: stuckPayouts._sum.amount ?? 0,
      });
    }
  }

  return { transfersSettled, latePaymentsChecked: latePayments.length, stuckMoney: stuckCount };
}
