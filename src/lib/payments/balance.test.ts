import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBalanceCache, hasSettledFunds } from "./balance";
import type { PaymentProviderClient } from "./types";
import { paystackClient } from "./paystack";
import { flutterwaveClient } from "./flutterwave";

const providerWith = (balance: number | null): PaymentProviderClient & { calls: number } => {
  const p = { name: "PAYSTACK", calls: 0, availableBalance: async () => { p.calls++; return balance; } } as unknown as PaymentProviderClient & { calls: number };
  return p;
};

beforeEach(() => {
  clearBalanceCache();
  vi.stubEnv("FLUTTERWAVE_SECRET_KEY", "test-key");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("hasSettledFunds", () => {
  it("allows a payout the settled balance covers, and declines one it does not", async () => {
    expect(await hasSettledFunds(providerWith(100_000), 100_000)).toEqual({ ok: true });
    clearBalanceCache();
    expect(await hasSettledFunds(providerWith(99_999), 100_000)).toEqual({ ok: false, available: 99_999 });
  });
  it("goes ahead when the balance can't be read, rather than blocking every payout", async () => {
    expect(await hasSettledFunds(providerWith(null), 5_000_000)).toEqual({ ok: true });
  });
  it("asks the provider once per short window", async () => {
    const p = providerWith(1_000_000);
    await hasSettledFunds(p, 1);
    await hasSettledFunds(p, 1);
    expect(p.calls).toBe(1);
  });
});

describe("provider balance lookups", () => {
  const reply = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

  it("reads Paystack's NGN balance in kobo and reports unknown on failure", async () => {
    reply(200, { status: true, data: [{ currency: "GHS", balance: 5 }, { currency: "NGN", balance: 123_456 }] });
    expect(await paystackClient.availableBalance()).toBe(123_456);
    reply(500, { status: false, message: "down" });
    expect(await paystackClient.availableBalance()).toBeNull();
  });
  it("reads Flutterwave's balance (naira) as kobo", async () => {
    reply(200, { status: "success", data: { available_balance: 1500.5 } });
    expect(await flutterwaveClient.availableBalance()).toBe(150_050);
  });
  it("treats a Flutterwave transfer it has no record of as failed", async () => {
    reply(200, { status: "success", data: [] });
    expect(await flutterwaveClient.verifyTransfer("never-sent")).toBe("FAILED");
    reply(200, { status: "success", data: [{ status: "SUCCESSFUL" }] });
    expect(await flutterwaveClient.verifyTransfer("sent")).toBe("SUCCESS");
  });
});
