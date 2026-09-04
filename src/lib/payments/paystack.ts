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
  PaymentProviderClient,
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
