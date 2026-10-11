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
 * - success on a row already FAILED → the money did go out after all, so
 *   the row goes back to COMPLETE and a withdrawal's credited-back money
 *   comes out of the wallet again (finding #21). This is the one transition
 *   that can leave a wallet negative, and it is meant to: see its own
 *   comment for why that is the honest entry rather than a mistake.
 *   The same transition on a prize payout is worse — a failed payout
 *   releases the claim, so the champion may already have been paid again —
 *   and there is no balance to take it back out of, so it records the row
 *   and raises a loud alert naming both payments instead of correcting them.
 *
 * Every change is a compare-and-swap on the row's status, so a webhook
 * replay, the webhook racing the sweep, or the webhook racing the route
 * that initiated the transfer all apply an outcome once — the wallet is
 * credited back exactly once, and taken back exactly once.
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
      if (done.count) return "APPLIED";
      // Already settled, one way or another. A replayed webhook lands here and must take nothing back a
      // second time.
      if (withdrawal.status !== "FAILED") return "NO_CHANGE";

      // Finding #21. The row says FAILED and the provider says the money went out anyway — so the balance
      // was given back when it was marked failed, and Circuit is now short by the amount while the player
      // holds it twice. Both halves of that have to be put right, and together: taking the money back while
      // the row still read FAILED would leave /admin/finance showing a failed withdrawal whose amount had
      // been debited, which is the same lie pointing the other way.
      //
      // The debit is deliberately unconditional, so the balance goes negative if the player already spent
      // the refunded money. That is the truthful entry — they were paid twice and the second payment is a
      // debt — and it is safe to record because every spend path in the app (withdrawals, entry fees,
      // stakes, Marketplace) already requires `walletBalance >= amount`, so a negative balance blocks them
      // until it is settled. Clamping it at zero instead would quietly forgive the difference and leave
      // nothing behind to collect.
      const clawedBack = await prisma.$transaction(async (tx) => {
        const flipped = await tx.walletTransaction.updateMany({
          where: { id: withdrawal.id, status: "FAILED" },
          data: { status: "COMPLETE" },
        });
        if (flipped.count === 0) return false;
        await tx.user.update({ where: { id: withdrawal.userId }, data: { walletBalance: { decrement: withdrawal.amount } } });
        return true;
      });
      if (!clawedBack) return "NO_CHANGE";

      // Read back rather than assume: whether the clawback left the player overdrawn is the one fact that
      // decides whether this needs a person today or is simply a corrected ledger, so it goes in the alert.
      const { walletBalance } = await prisma.user.findUniqueOrThrow({
        where: { id: withdrawal.userId },
        select: { walletBalance: true },
      });
      captureMessage("Withdrawal succeeded after it was marked failed and refunded to the wallet", "error", {
        walletTransactionId: withdrawal.id,
        userId: withdrawal.userId,
        amount: withdrawal.amount,
        balanceAfterClawback: walletBalance,
        playerOverdrawn: walletBalance < 0,
      });
      return "APPLIED";
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
    if (outcome === "SUCCESS") {
      const done = await prisma.escrowTransaction.updateMany({ where: { id: payout.id, status: "PENDING" }, data: { status: "COMPLETE" } });
      if (done.count) return "APPLIED";
      // A COMPLETE row is a replay of a success we already recorded, and there is nothing to say about it.
      // A FAILED row is what this branch is for — the same shape as the withdrawal branch above, and the
      // reason a prize payout used to be able to go out twice. A failed payout releases the claim (the
      // payout route treats only PENDING and COMPLETE as spoken for), so the champion may have claimed
      // again and been paid again under a second reference by now. Nothing else ever asks the provider
      // about a FAILED reference again — the sweep re-checks PENDING rows only — so this webhook is the
      // last chance to record that the first transfer did land after all.
      if (payout.status !== "FAILED") return "NO_CHANGE";

      const flipped = await prisma.escrowTransaction.updateMany({ where: { id: payout.id, status: "FAILED" }, data: { status: "COMPLETE" } });
      if (flipped.count === 0) return "NO_CHANGE";

      // Unlike a withdrawal there is no balance to take this back out of — the money is in the champion's
      // bank — so the honest output is a loud one for a person, not a correction. Counting the other
      // completed payouts for the same champion and tournament is what separates "something is off" from
      // "this player has been paid twice, here is how much".
      const alsoPaid =
        payout.tournamentId && payout.userId
          ? await prisma.escrowTransaction.aggregate({
              where: {
                tournamentId: payout.tournamentId,
                userId: payout.userId,
                type: "PRIZE_PAYOUT",
                status: "COMPLETE",
                id: { not: payout.id },
              },
              _count: true,
              _sum: { amount: true },
            })
          : null;
      captureMessage("Prize payout succeeded after it was marked failed", "error", {
        escrowTransactionId: payout.id,
        tournamentId: payout.tournamentId,
        userId: payout.userId,
        amount: payout.amount,
        otherPayoutsForTournament: alsoPaid?._count ?? 0,
        otherPayoutsKobo: alsoPaid?._sum.amount ?? 0,
        playerPaidTwice: (alsoPaid?._count ?? 0) > 0,
      });
      return "APPLIED";
    }

    const flipped = await prisma.escrowTransaction.updateMany({
      where: { id: payout.id, status: { in: ["PENDING", "COMPLETE"] } },
      data: { status: "FAILED" },
    });
    if (flipped.count === 0) return "NO_CHANGE";
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
/** Exported for the paging tests, which have to build a batch and a half (and a ceiling's worth) to see it. */
export const RECONCILE_BATCH = 25;
/**
 * How many batches of stale transfers one run will walk. The sweep on its own is a two-minute schedule
 * (vercel.json), each row is a provider round trip, and the loop is sequential — so 4 batches × 25 rows ×
 * the two tables is 200 calls at worst, roughly a minute, and the next run has room. A bigger ceiling
 * would have back-to-back runs overlapping. Reaching it means the backlog is not clearing, which is the
 * state the stuck-money alert below has already raised for a person.
 */
export const RECONCILE_MAX_BATCHES = 4;

/** Where a page starts from: before any row, so the paging below needs no first-page branch.
 *  Dates are stored at millisecond precision and ids are cuids, so both are lower bounds on any real row. */
const RECONCILE_START: ReconcileCursor = { createdAt: new Date(0), id: "" };

/**
 * A position in one of the two transfer tables, for keyset paging.
 *
 * `id` is part of it because `createdAt` alone is not unique: a batch of transfers written by one request
 * shares a timestamp, and a cursor carrying only the time would step over the rest of that batch.
 */
type ReconcileCursor = { createdAt: Date; id: string };

/** The rows after `cursor` in `createdAt asc, id asc` order — what the previous page ended on. */
function afterCursor(cursor: ReconcileCursor) {
  return {
    OR: [
      { createdAt: { gt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
    ],
  };
}

/**
 * Sweep backstop (runScheduledSweep): asks the provider about transfers
 * still pending after 30 minutes, and re-checks entry fees whose player
 * withdrew or re-checked-out before the payment finished
 * (confirmEntryFeePayment refunds them if the charge went through).
 *
 * The transfer half walks *batches* rather than a single page of the 25 oldest. A single page was a
 * starvation bug with no symptom: a transfer the provider keeps answering PENDING about never settles,
 * never leaves the set and never loses its place at the front, so twenty-five of them — a payout method
 * caught behind a Transfer OTP nobody cleared, which docs/pre-launch-checklist.md already warns about —
 * and this loop stopped asking about anything newer, permanently. The run still reported success and the
 * stuck-money alert counted a backlog that was growing for a reason this code could no longer see. It
 * would have gone on asking about the same stuck twenty-five every two minutes forever.
 *
 * Paging is keyset rather than offset for a second reason on top of the obvious: rows this loop *does*
 * settle leave the set as it goes, so `skip: 25` on the next page would step over the rows that moved up
 * into the gap behind them. "What comes after this row" does not care what left.
 */
export async function reconcilePendingMoney(): Promise<{
  transfersSettled: number;
  latePaymentsChecked: number;
  /** Transfers still PENDING after a day, whether or not this run got to alert about them. */
  stuckMoney: number;
}> {
  const staleBefore = new Date(Date.now() - TRANSFER_STALE_MS);
  let transfersSettled = 0;
  let withdrawalCursor = RECONCILE_START;
  let payoutCursor = RECONCILE_START;

  for (let batch = 0; batch < RECONCILE_MAX_BATCHES; batch++) {
    const [withdrawals, payouts] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { type: "WITHDRAWAL", status: "PENDING", createdAt: { lt: staleBefore }, providerRef: { not: null }, provider: { not: null }, ...afterCursor(withdrawalCursor) },
        select: { id: true, createdAt: true, providerRef: true, provider: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: RECONCILE_BATCH,
      }),
      prisma.escrowTransaction.findMany({
        where: { type: "PRIZE_PAYOUT", status: "PENDING", createdAt: { lt: staleBefore }, providerRef: { not: null }, provider: { not: null }, ...afterCursor(payoutCursor) },
        select: { id: true, createdAt: true, providerRef: true, provider: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: RECONCILE_BATCH,
      }),
    ]);

    if (withdrawals.length === 0 && payouts.length === 0) break;
    if (withdrawals.length) withdrawalCursor = withdrawals[withdrawals.length - 1];
    if (payouts.length) payoutCursor = payouts[payouts.length - 1];

    for (const row of [...withdrawals, ...payouts]) {
      try {
        const status = await getPaymentProvider(row.provider!).verifyTransfer(row.providerRef!);
        if (status === "PENDING") continue;
        if ((await applyTransferOutcome(row.providerRef!, status)) === "APPLIED") transfersSettled++;
      } catch (err) {
        // One row that will not answer must not end the run: it holds its place at the front of the queue
        // for the next one, and the batches above are what stop it holding the whole queue.
        captureException(err, { source: "reconcilePendingMoney", reference: row.providerRef });
      }
    }

    // A short page is the end of the set — the next one would come back empty.
    if (withdrawals.length < RECONCILE_BATCH && payouts.length < RECONCILE_BATCH) break;
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
