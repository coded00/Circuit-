/**
 * Circuit — payment provider factory (Build Plan task P0-4).
 *
 * This is the only file Phase 2 code should import from `src/lib/payments`.
 * It picks a provider client without callers needing to know Paystack from
 * Flutterwave.
 */

import type { PaymentProviderClient } from "./types";
import { paystackClient } from "./paystack";
import { flutterwaveClient } from "./flutterwave";

export * from "./types";

const providers: Record<"PAYSTACK" | "FLUTTERWAVE", PaymentProviderClient> = {
  PAYSTACK: paystackClient,
  FLUTTERWAVE: flutterwaveClient,
};

export function getPaymentProvider(
  name: "PAYSTACK" | "FLUTTERWAVE"
): PaymentProviderClient {
  return providers[name];
}

/**
 * Default provider for new charges. Kept as a single switch point so
 * "which provider is primary" is a one-line change, not a search-and-replace.
 */
export function getDefaultPaymentProvider(): PaymentProviderClient {
  return providers.PAYSTACK;
}

/** ACC-2 allows phone-only signup, but both payment providers' hosted
 *  checkout requires an email. Not a real email inbox — just a stable,
 *  provider-acceptable placeholder tied to the account. Shared by every
 *  flow that opens a hosted checkout (tournament entry fees, wallet
 *  funding). */
export function toCheckoutEmail(emailOrPhone: string, userId: string): string {
  return emailOrPhone.includes("@") ? emailOrPhone : `${userId}@users.circuit.ng`;
}
