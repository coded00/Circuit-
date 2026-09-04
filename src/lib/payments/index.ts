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
