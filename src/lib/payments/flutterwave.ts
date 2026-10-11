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
  TransferStatus,
  VerifyChargeResult,
} from "./types";
import { ProviderRequestError } from "./errors";

const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";

function getSecretKey(): string {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) {
    throw new Error("FLUTTERWAVE_SECRET_KEY is not set. Check your .env file.");
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
    throw new ProviderRequestError(`Flutterwave request failed: ${body.message ?? res.statusText}`, res.status);
  }
  return body.data as T;
}

/**
 * Flutterwave's charge status, mapped onto ours — the same shape as
 * mapPaystackChargeStatus, and the same bug fixed for the same reason.
 *
 * This used to be `status === "successful" ? "SUCCESS" : status === "pending" ? "PENDING" : "FAILED"`,
 * which made every status Flutterwave might add — or any settling state that isn't literally "pending" —
 * a terminal FAILED. FAILED is not a label here, it's a decision: the confirmation path refunds the
 * charge and releases the entry, so calling a live payment FAILED returns the player's money while the
 * payment itself still lands. Only "failed" is treated as terminal; anything unrecognised stays PENDING,
 * where the sweep re-verifies it later. Wrong-PENDING costs a delay, wrong-FAILED costs money.
 */
export function mapFlutterwaveChargeStatus(status: string): VerifyChargeResult["status"] {
  if (status === "successful" || status === "completed") return "SUCCESS";
  if (status === "failed") return "FAILED";
  return "PENDING";
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
      status: mapFlutterwaveChargeStatus(data.status),
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

  async verifyTransfer(reference: string): Promise<TransferStatus> {
    const data = await flutterwaveFetch<{ status: string }[]>(`/transfers?reference=${encodeURIComponent(reference)}`);
    // No transfer under this reference: Flutterwave never received it. Callers only ask about transfers that
    // are already old, so this is one that did not happen and the money can go back.
    if (Array.isArray(data) && data.length === 0) return "FAILED";
    const status = Array.isArray(data) ? data[0]?.status : undefined;
    if (status === "SUCCESSFUL") return "SUCCESS";
    if (status === "FAILED") return "FAILED";
    return "PENDING";
  },

  async availableBalance(): Promise<number | null> {
    try {
      const data = await flutterwaveFetch<{ available_balance: number }>("/balances/NGN");
      return typeof data?.available_balance === "number" ? Math.round(data.available_balance * 100) : null; // naira -> kobo
    } catch {
      return null;
    }
  },

  async initiateTransfer(input: InitiateTransferInput): Promise<InitiateTransferResult> {
    // NOTE: destinationRef is assumed to carry the bank account details
    // Flutterwave's /transfers endpoint expects (account_bank + account_number).
    // Resolving a stored payout method (P0-7) into that shape happens before
    // this call, not inside this client.
    let destination: { account_bank: string; account_number: string };
    try {
      destination = JSON.parse(input.destinationRef);
      if (!destination.account_bank || !destination.account_number) {
        throw new Error("Missing account_bank or account_number.");
      }
    } catch {
      throw new Error(`Invalid Flutterwave destination reference: "${input.destinationRef}". Expected JSON with account_bank and account_number.`);
    }
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
