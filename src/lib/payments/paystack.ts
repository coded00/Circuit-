/**
 * Circuit — Paystack implementation of PaymentProviderClient (task P0-4).
 *
 * Uses Paystack's REST API directly (no SDK dependency) since the surface
 * area we need is small: initialize a hosted transaction, verify it, and
 * issue a transfer. https://paystack.com/docs/api/
 */

import type {
  InitializeChargeInput,
  InitializeChargeResult,
  InitiateTransferInput,
  InitiateTransferResult,
  MinorAmount,
  PaymentProviderClient,
  RefundChargeResult,
  VerifyChargeResult,
} from "./types";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error("PAYSTACK_SECRET_KEY is not set — check your .env file.");
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
    throw new Error(`Paystack request failed: ${body.message ?? res.statusText}`);
  }
  return body.data as T;
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
      status:
        data.status === "success" ? "SUCCESS" : data.status === "abandoned" ? "PENDING" : "FAILED",
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
