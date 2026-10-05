/**
 * Circuit — "is there settled money to send?" Entry fees are collected into the payment provider's balance but
 * only become spendable once the provider settles them (Paystack: T+1). Sending a transfer before that fails
 * with "insufficient balance", after the user's claim or withdrawal has already been reserved. Asking first
 * means a payout that cannot go out yet is declined cleanly and tried later, instead of failing midway.
 *
 * If the balance cannot be read the answer is "go ahead": a lookup failure must not stop every payout.
 */
import type { PaymentProviderClient } from "@/lib/payments/types";
import { captureMessage } from "@/lib/observability";

const CACHE_MS = 20_000;
const cache = new Map<string, { at: number; value: number | null }>();

export async function hasSettledFunds(provider: PaymentProviderClient, amount: number): Promise<{ ok: true } | { ok: false; available: number }> {
  const hit = cache.get(provider.name);
  let balance: number | null;
  if (hit && Date.now() - hit.at < CACHE_MS) {
    balance = hit.value;
  } else {
    balance = await provider.availableBalance();
    cache.set(provider.name, { at: Date.now(), value: balance });
  }
  if (balance === null || balance >= amount) return { ok: true };
  captureMessage("Payout declined: the provider's settled balance is below the amount", "warning", { provider: provider.name, available: balance, amount });
  return { ok: false, available: balance };
}

/** For tests. */
export function clearBalanceCache(): void {
  cache.clear();
}
