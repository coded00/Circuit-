/**
 * Circuit — Bachs implementation of PaymentProviderClient.
 *
 * Bachs handles card/bank collection and refunds. Payouts to winners and wallet withdrawals stay on
 * Paystack (see getPayoutProvider in ./index): Bachs withdrawals go to destinations that must be approved
 * first (`is_usable`), which does not fit paying arbitrary players on demand. initiateTransfer and
 * verifyTransfer therefore refuse here, loudly, rather than half-working.
 *
 * Bachs amounts are decimal strings ("2000.00"), Circuit's are kobo. https://docs.bachs.io
 *
 * Shapes marked ASSUMPTION below come from a docs summary that did not list the full object. Check them
 * against the sandbox before going live (scripts/bachs-sandbox-check.mjs is the place for that).
 */

import { ProviderRequestError } from "./errors";
import type {
  InitializeChargeInput,
  InitializeChargeResult,
  InitiateTransferResult,
  MinorAmount,
  PaymentProviderClient,
  RefundChargeResult,
  TransferStatus,
  VerifyChargeResult,
} from "./types";

const REQUEST_TIMEOUT_MS = 10_000;

function baseUrl(): string {
  const key = process.env.BACHS_API_KEY ?? "";
  // A sandbox key never talks to production and a live key never to the sandbox.
  return key.startsWith("sk_live_") ? "https://api.bachs.io" : "https://sandbox-api.bachs.io";
}

function getApiKey(): string {
  const key = process.env.BACHS_API_KEY;
  if (!key) throw new Error("BACHS_API_KEY is not set. Check your .env file.");
  return key;
}

async function bachsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page: fall through to the status check */
  }
  if (!res.ok) {
    const message = (body as { message?: string; error?: string } | null)?.message ?? (body as { error?: string } | null)?.error ?? res.statusText;
    throw new ProviderRequestError(`Bachs request failed: ${message}`, res.status);
  }
  return body as T;
}

/** 200000 kobo → "2000.00". Integer maths only, so there is no float rounding on money. */
export function koboToDecimal(kobo: MinorAmount): string {
  const whole = Math.trunc(kobo / 100);
  const frac = Math.abs(kobo % 100);
  return `${whole}.${String(frac).padStart(2, "0")}`;
}

/** "2000.00" → 200000 kobo. */
export function decimalToKobo(value: string | number): MinorAmount {
  const [whole, frac = ""] = String(value).split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/** Refund references carry the charge reference so a refund webhook can be traced back to its charge. */
const REFUND_PREFIX = "refund:";
export function refundReference(chargeRef: string, amount: MinorAmount): string {
  return `${REFUND_PREFIX}${chargeRef}:${amount}`;
}
export function chargeRefFromRefundReference(reference: string): string | null {
  if (!reference.startsWith(REFUND_PREFIX)) return null;
  const rest = reference.slice(REFUND_PREFIX.length);
  const cut = rest.lastIndexOf(":");
  return cut > 0 ? rest.slice(0, cut) : null;
}

type BachsPayment = {
  charge_id?: string;
  id?: string;
  reference?: string;
  status?: string;
  amount?: string;
  currency?: string;
  completed_at?: string | null;
  paid_at?: string | null;
  created_at?: string;
};

/** ASSUMPTION: GET /v1/payments?reference= returns a bare array or a { data: [...] } wrapper. */
function firstPayment(body: unknown): BachsPayment | null {
  const list = Array.isArray(body) ? body : ((body as { data?: unknown; items?: unknown })?.data ?? (body as { items?: unknown })?.items);
  return Array.isArray(list) && list.length > 0 ? (list[0] as BachsPayment) : null;
}

async function findPayment(reference: string): Promise<BachsPayment | null> {
  const body = await bachsFetch<unknown>(`/v1/payments?reference=${encodeURIComponent(reference)}`);
  return firstPayment(body);
}

/** collection.succeeded does not carry our reference: look it up from the checkout it belongs to. */
export async function referenceForCheckout(checkoutId: string): Promise<string | null> {
  const data = await bachsFetch<{ reference?: string | null }>(`/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`);
  return data?.reference ?? null;
}

/** ASSUMPTION: payment statuses are SUCCEEDED / FAILED (as in collection.succeeded); anything unrecognised stays PENDING. */
export function mapBachsPaymentStatus(status: string | undefined): VerifyChargeResult["status"] {
  const s = (status ?? "").toLowerCase();
  if (["succeeded", "success", "paid", "completed"].includes(s)) return "SUCCESS";
  if (["failed", "expired", "cancelled", "canceled"].includes(s)) return "FAILED";
  return "PENDING";
}

export const bachsClient: PaymentProviderClient = {
  name: "BACHS",

  async initializeCharge(input: InitializeChargeInput): Promise<InitializeChargeResult> {
    const data = await bachsFetch<{ checkout_url: string }>("/v1/checkout-sessions", {
      method: "POST",
      body: JSON.stringify({
        pricing: { currency: input.currency, amount: koboToDecimal(input.amount) },
        customer: { email: input.email },
        reference: input.reference,
        metadata: input.metadata,
        success_url: input.callbackUrl,
        cancel_url: input.callbackUrl,
        payment_method_types: ["NGN_CARD", "NGN_BANK_TRANSFER"], // ASSUMPTION: NGN corridor names follow USD_CARD / NGN_BANK_TRANSFER
      }),
    });
    if (!data?.checkout_url) throw new ProviderRequestError("Bachs returned no checkout URL", 502);
    // Our own reference is the key everywhere in Circuit, same as Paystack.
    return { authorizationUrl: data.checkout_url, providerReference: input.reference };
  },

  async verifyCharge(providerReference: string): Promise<VerifyChargeResult> {
    const payment = await findPayment(providerReference);
    // No payment yet means the customer hasn't paid (or hasn't finished): still pending, like Paystack's "abandoned".
    if (!payment) {
      return { status: "PENDING", amount: 0, currency: "NGN", providerReference, paidAt: null };
    }
    const paidAt = payment.completed_at ?? payment.paid_at ?? null;
    return {
      status: mapBachsPaymentStatus(payment.status),
      amount: decimalToKobo(payment.amount ?? "0"),
      currency: "NGN",
      providerReference,
      paidAt: paidAt ? new Date(paidAt) : null,
    };
  },

  async refundCharge(providerReference: string, amount: MinorAmount): Promise<RefundChargeResult> {
    const payment = await findPayment(providerReference);
    const chargeId = payment?.charge_id ?? payment?.id;
    if (!chargeId) throw new ProviderRequestError(`Bachs has no payment for ${providerReference}`, 404);
    const reference = refundReference(providerReference, amount);
    const data = await bachsFetch<{ status?: string }>("/v1/refunds", {
      method: "POST",
      headers: { "Idempotency-Key": reference },
      body: JSON.stringify({
        charge_id: chargeId,
        reference,
        amount: koboToDecimal(amount),
        idempotency_key: reference,
      }),
    });
    const s = (data?.status ?? "").toLowerCase();
    return { status: s === "success" ? "SUCCESS" : s === "failed" ? "FAILED" : "PENDING", providerReference };
  },

  async availableBalance(): Promise<number | null> {
    return null; // payouts do not run on Bachs, so nothing here depends on its balance
  },

  async initiateTransfer(): Promise<InitiateTransferResult> {
    throw new Error("Bachs payouts are not enabled: prizes and withdrawals are paid through Paystack.");
  },

  async verifyTransfer(): Promise<TransferStatus> {
    throw new Error("Bachs payouts are not enabled: transfers are verified with the provider that sent them.");
  },
};
