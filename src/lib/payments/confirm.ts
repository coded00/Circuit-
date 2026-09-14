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

  await prisma.$transaction([
    prisma.registration.update({
      where: { id: registration.id },
      data: { status: "CONFIRMED" },
    }),
    prisma.escrowTransaction.update({
      where: { id: escrowTxn.id },
      data: { status: "COMPLETE" },
    }),
  ]);

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

  await prisma.$transaction([
    prisma.walletTransaction.update({ where: { id: txn.id }, data: { status: "COMPLETE" } }),
    prisma.user.update({ where: { id: txn.userId }, data: { walletBalance: { increment: txn.amount } } }),
  ]);
}
