/**
 * Circuit — payment provider factory (Build Plan task P0-4).
 *
 * This is the only file Phase 2 code should import from `src/lib/payments`.
 * It picks a provider client without callers needing to know Paystack from
 * Flutterwave from Bachs.
 *
 * Routing: new charges go to the primary provider (PAYMENT_PRIMARY_PROVIDER, default PAYSTACK) and fall
 * back to PAYMENT_FALLBACK_PROVIDER when the primary is unreachable. Everything that happens to an
 * existing payment (verify, refund, transfer status) goes to the provider recorded on that payment, via
 * getPaymentProvider(name). Payouts always use getPayoutProvider().
 */

import type { InitializeChargeInput, InitializeChargeResult, PaymentProviderClient, ProviderName } from "./types";
import { ProviderRequestError } from "./errors";
import { paystackClient } from "./paystack";
import { flutterwaveClient } from "./flutterwave";
import { bachsClient } from "./bachs";
import { captureException } from "@/lib/observability";

export * from "./types";

const providers: Record<ProviderName, PaymentProviderClient> = {
  PAYSTACK: paystackClient,
  FLUTTERWAVE: flutterwaveClient,
  BACHS: bachsClient,
};

export function getPaymentProvider(name: ProviderName): PaymentProviderClient {
  return providers[name];
}

function fromEnv(variable: string, fallback: ProviderName): ProviderName {
  const value = process.env[variable];
  return value && value in providers ? (value as ProviderName) : fallback;
}

/** Provider for new charges. Defaults to Paystack until PAYMENT_PRIMARY_PROVIDER says otherwise. */
export function getDefaultPaymentProvider(): PaymentProviderClient {
  return providers[fromEnv("PAYMENT_PRIMARY_PROVIDER", "PAYSTACK")];
}

/** Provider for charges when the primary can't be reached, or null if there is no distinct fallback. */
export function getFallbackPaymentProvider(): PaymentProviderClient | null {
  const primary = getDefaultPaymentProvider();
  const fallback = providers[fromEnv("PAYMENT_FALLBACK_PROVIDER", "PAYSTACK")];
  return fallback.name === primary.name ? null : fallback;
}

/**
 * Provider for prize payouts and wallet withdrawals. Kept on Paystack independent of who collects the
 * money: its payout recipients are what players have on file, and a timed-out payout must stay with the
 * provider that may have sent it (never fall back on a payout: it could pay twice).
 */
export function getPayoutProvider(): PaymentProviderClient {
  return providers[fromEnv("PAYMENT_PAYOUT_PROVIDER", "PAYSTACK")];
}

/** True when trying another provider is safe and useful: they could not be reached, timed out, or we are
 *  misconfigured with them. A plain 4xx means the request itself was bad, and another provider would only mask that. */
export function shouldFallBack(err: unknown): boolean {
  if (!(err instanceof ProviderRequestError)) return true; // network failure, timeout, missing key
  return err.status >= 500 || err.status === 401 || err.status === 403 || err.status === 429;
}

/**
 * Starts a hosted checkout on the primary provider, then the fallback if the primary could not create one.
 * Returns the provider that actually holds the charge: callers must record THAT name on the payment, since
 * every later verify and refund is routed by it. Safe to fall back because no charge exists yet: a checkout
 * the primary half-created is just an unpaid session that expires.
 */
export async function initializeChargeWithFallback(
  input: InitializeChargeInput
): Promise<{ provider: PaymentProviderClient; charge: InitializeChargeResult }> {
  const primary = getDefaultPaymentProvider();
  try {
    return { provider: primary, charge: await primary.initializeCharge(input) };
  } catch (err) {
    const fallback = getFallbackPaymentProvider();
    if (!fallback || !shouldFallBack(err)) throw err;
    captureException(err, { source: "payments:chargeFallback", from: primary.name, to: fallback.name });
    return { provider: fallback, charge: await fallback.initializeCharge(input) };
  }
}

/** ACC-2 allows phone-only signup, but every provider's hosted
 *  checkout requires an email. Not a real email inbox — just a stable,
 *  provider-acceptable placeholder tied to the account. Shared by every
 *  flow that opens a hosted checkout (tournament entry fees, wallet
 *  funding). */
export function toCheckoutEmail(emailOrPhone: string, userId: string): string {
  return emailOrPhone.includes("@") ? emailOrPhone : `${userId}@users.circuit.ng`;
}
