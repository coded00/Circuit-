/**
 * Circuit — Paystack implementation of PaymentProviderClient (task P0-4).
 *
 * Uses Paystack's REST API directly (no SDK dependency) since the surface
 * area we need is small: initialize a hosted transaction, verify it, and
 * issue a transfer. https://paystack.com/docs/api/
 */

import { ProviderRequestError } from "./errors";
import type {
  InitializeChargeInput,
  InitializeChargeResult,
  InitiateTransferInput,
  InitiateTransferResult,
  MinorAmount,
  PaymentProviderClient,
  RefundChargeResult,
  TransferStatus,
  VerifyChargeResult,
} from "./types";

// Overridable so a local fake Paystack (scripts/fake-paystack.mjs) can stand in for load tests.
// Honoured only with a test key: a live key always talks to the real API.
const PAYSTACK_BASE_URL =
  process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_") && process.env.PAYSTACK_BASE_URL
    ? process.env.PAYSTACK_BASE_URL
    : "https://api.paystack.co";

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error("PAYSTACK_SECRET_KEY is not set. Check your .env file.");
  }
  return key;
}

async function paystackFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json();
  if (!res.ok || body.status === false) {
    throw new ProviderRequestError(`Paystack request failed: ${body.message ?? res.statusText}`, res.status);
  }
  return body.data as T;
}

/** Paystack transfer states → ours. "otp"/"pending"/"processing"/"queued" all mean still in flight. */
export function mapPaystackTransferStatus(status: string): TransferStatus {
  if (status === "success") return "SUCCESS";
  if (status === "reversed") return "REVERSED";
  if (["failed", "abandoned", "blocked", "rejected"].includes(status)) return "FAILED";
  return "PENDING";
}

/**
 * Paystack charge (transaction) states → ours — the same shape as the transfer mapping above, for the same
 * reason, and it matters more here.
 *
 * `/transaction/verify` reports "success", "failed" and "reversed", and — while a charge is still settling —
 * "abandoned", "ongoing", "pending", "processing" and "queued". This used to send everything that wasn't
 * "success" or "abandoned" to FAILED, which made a settling charge look permanently failed.
 *
 * FAILED is terminal for every caller: confirmWalletFunding and confirmEntryFeePayment flip the row and stop
 * looking at it, the webhook replay and the redirect callback both return early on a row that is no longer
 * PENDING, and reconcilePendingMoney only revisits PENDING rows. So calling an in-flight charge FAILED meant
 * that if the charge then completed, Circuit held the customer's money with the wallet never credited and no
 * refund — silently. Nothing may become FAILED unless Paystack has said it will not succeed; being wrong in
 * the other direction (PENDING) costs one more look.
 *
 * Anything unrecognised is therefore PENDING, not FAILED.
 */
export function mapPaystackChargeStatus(status: string): VerifyChargeResult["status"] {
  if (status === "success") return "SUCCESS";
  if (["failed", "reversed"].includes(status)) return "FAILED";
  return "PENDING";
}

export type BankItem = {
  name: string;
  code: string;
  slug: string;
};

export async function listBanks(): Promise<BankItem[]> {
  const data = await paystackFetch<Array<{ name: string; code: string; slug: string; active?: boolean }>>(
    "/bank?country=nigeria&perPage=100"
  );
  return data
    .filter((b) => b.active !== false)
    .map((b) => ({ name: b.name, code: b.code, slug: b.slug }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveAccountNumber(
  accountNumber: string,
  bankCode: string
): Promise<{ accountNumber: string; accountName: string; bankId: number }> {
  const data = await paystackFetch<{
    account_number: string;
    account_name: string;
    bank_id: number;
  }>(`/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`);
  return {
    accountNumber: data.account_number,
    accountName: data.account_name,
    bankId: data.bank_id,
  };
}

export async function createTransferRecipient(input: {
  accountName: string;
  accountNumber: string;
  bankCode: string;
}): Promise<{ recipientCode: string }> {
  const data = await paystackFetch<{
    recipient_code: string;
  }>("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({
      type: "nuban",
      name: input.accountName,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: "NGN",
    }),
  });
  return {
    recipientCode: data.recipient_code,
  };
}


export const paystackClient: PaymentProviderClient = {
  name: "PAYSTACK",

  async initializeCharge(input: InitializeChargeInput): Promise<InitializeChargeResult> {
    const data = await paystackFetch<{
      authorization_url: string;
      reference: string;
    }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        amount: input.amount,
        email: input.email,
        currency: input.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    });
    return {
      authorizationUrl: data.authorization_url,
      providerReference: data.reference,
    };
  },

  async verifyCharge(providerReference: string): Promise<VerifyChargeResult> {
    const data = await paystackFetch<{
      status: string;
      amount: number;
      currency: string;
      reference: string;
      paid_at: string | null;
    }>(`/transaction/verify/${encodeURIComponent(providerReference)}`);
    return {
      status: mapPaystackChargeStatus(data.status),
      amount: data.amount,
      currency: "NGN",
      providerReference: data.reference,
      paidAt: data.paid_at ? new Date(data.paid_at) : null,
    };
  },

  async refundCharge(providerReference: string, amount: MinorAmount): Promise<RefundChargeResult> {
    const data = await paystackFetch<{ status: string; transaction: { reference: string } }>(
      "/refund",
      {
        method: "POST",
        body: JSON.stringify({ transaction: providerReference, amount }),
      }
    );
    return {
      status: data.status === "processed" ? "SUCCESS" : "PENDING",
      providerReference: data.transaction?.reference ?? providerReference,
    };
  },

  async availableBalance(): Promise<number | null> {
    try {
      const data = await paystackFetch<{ currency: string; balance: number }[]>("/balance");
      const ngn = Array.isArray(data) ? data.find((b) => b.currency === "NGN") : undefined;
      return typeof ngn?.balance === "number" ? ngn.balance : null;
    } catch {
      return null; // unknown, not "empty": callers carry on rather than blocking every payout on a lookup failure
    }
  },

  async verifyTransfer(reference: string): Promise<TransferStatus> {
    try {
      const data = await paystackFetch<{ status: string }>(`/transfer/verify/${encodeURIComponent(reference)}`);
      return mapPaystackTransferStatus(data.status);
    } catch (err) {
      // Paystack has no transfer under this reference: it never received it (the call that created it
      // failed before reaching them). Callers only ask about transfers that are already old, so this is
      // a transfer that did not happen and the money can go back.
      if (err instanceof ProviderRequestError && err.status === 404) return "FAILED";
      throw err;
    }
  },

  async initiateTransfer(input: InitiateTransferInput): Promise<InitiateTransferResult> {
    // NOTE: Paystack transfers require a recipient code created ahead of
    // time via /transferrecipient. destinationRef is assumed to already be
    // that recipient code — resolving a raw bank account into one is a P0-7
    // / payout-setup concern, not this client's job.
    const data = await paystackFetch<{ status: string; reference: string }>("/transfer", {
      method: "POST",
      body: JSON.stringify({
        source: "balance",
        amount: input.amount,
        recipient: input.destinationRef,
        reference: input.reference,
        reason: input.reason,
      }),
    });
    return {
      status: data.status === "success" ? "SUCCESS" : "PENDING",
      providerReference: data.reference,
    };
  },
};
