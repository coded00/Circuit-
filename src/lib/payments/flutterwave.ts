/**
 * Circuit — Flutterwave implementation of PaymentProviderClient (task P0-4).
 *
 * Uses Flutterwave's REST API directly, same rationale as paystack.ts.
 * https://developer.flutterwave.com/docs
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

const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";

function getSecretKey(): string {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) {
    throw new Error("FLUTTERWAVE_SECRET_KEY is not set — check your .env file.");
  }
  return key;
}

async function flutterwaveFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${FLUTTERWAVE_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json();
  if (!res.ok || body.status === "error") {
    throw new Error(`Flutterwave request failed: ${body.message ?? res.statusText}`);
  }
  return body.data as T;
}

export const flutterwaveClient: PaymentProviderClient = {
  name: "FLUTTERWAVE",

  async initializeCharge(input: InitializeChargeInput): Promise<InitializeChargeResult> {
    const data = await flutterwaveFetch<{ link: string }>("/payments", {
      method: "POST",
      body: JSON.stringify({
        tx_ref: input.reference,
        amount: input.amount / 100, // Flutterwave takes major units, unlike Paystack
        currency: input.currency,
        redirect_url: input.callbackUrl,
        customer: { email: input.email },
        meta: input.metadata,
      }),
    });
    return {
      authorizationUrl: data.link,
      providerReference: input.reference,
    };
  },

  async verifyCharge(providerReference: string): Promise<VerifyChargeResult> {
    const data = await flutterwaveFetch<{
      status: string;
      amount: number;
      currency: string;
      tx_ref: string;
      created_at: string;
    }>(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(providerReference)}`);
    return {
      status: data.status === "successful" ? "SUCCESS" : data.status === "pending" ? "PENDING" : "FAILED",
      amount: Math.round(data.amount * 100), // normalize back to minor units
      currency: "NGN",
      providerReference: data.tx_ref,
      paidAt: data.created_at ? new Date(data.created_at) : null,
    };
  },

  async refundCharge(providerReference: string, amount: MinorAmount): Promise<RefundChargeResult> {
    // Flutterwave's /refunds endpoint wants the numeric transaction id, not
    // our tx_ref — verify_by_reference is the lookup that resolves one to
    // the other.
    const transaction = await flutterwaveFetch<{ id: number }>(
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(providerReference)}`
    );
    const data = await flutterwaveFetch<{ status: string }>(
      `/transactions/${transaction.id}/refund`,
      {
        method: "POST",
        body: JSON.stringify({ amount: amount / 100 }),
      }
    );
    return {
      status: data.status === "completed" ? "SUCCESS" : "PENDING",
      providerReference,
    };
  },

  async initiateTransfer(input: InitiateTransferInput): Promise<InitiateTransferResult> {
    // NOTE: destinationRef is assumed to carry the bank account details
    // Flutterwave's /transfers endpoint expects (account_bank + account_number).
    // Resolving a stored payout method (P0-7) into that shape happens before
    // this call, not inside this client.
    const destination = JSON.parse(input.destinationRef) as {
      account_bank: string;
      account_number: string;
    };
    const data = await flutterwaveFetch<{ status: string; reference: string }>("/transfers", {
      method: "POST",
      body: JSON.stringify({
        account_bank: destination.account_bank,
        account_number: destination.account_number,
        amount: input.amount / 100,
        currency: input.currency,
        reference: input.reference,
        narration: input.reason,
      }),
    });
    return {
      status: data.status === "SUCCESSFUL" ? "SUCCESS" : "PENDING",
      providerReference: data.reference ?? input.reference,
    };
  },
};
