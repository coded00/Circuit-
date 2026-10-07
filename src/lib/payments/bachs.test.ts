import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderRequestError } from "./errors";
import {
  bachsClient,
  chargeRefFromRefundReference,
  decimalToKobo,
  koboToDecimal,
  mapBachsPaymentStatus,
  refundReference,
} from "./bachs";
import { verifyBachsSignature } from "./webhookVerification";
import { initializeChargeWithFallback, getPayoutProvider, shouldFallBack } from "./index";

vi.mock("@/lib/observability", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  process.env.BACHS_API_KEY = "sk_sandbox_test";
  process.env.BACHS_WEBHOOK_SECRET = "whsec_test";
  process.env.PAYSTACK_SECRET_KEY = "sk_test_x";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PAYMENT_PRIMARY_PROVIDER;
  delete process.env.PAYMENT_FALLBACK_PROVIDER;
  delete process.env.PAYMENT_PAYOUT_PROVIDER;
});

describe("kobo <-> decimal", () => {
  it("converts without float error", () => {
    expect(koboToDecimal(200000)).toBe("2000.00");
    expect(koboToDecimal(5)).toBe("0.05");
    expect(koboToDecimal(123456)).toBe("1234.56");
    expect(decimalToKobo("2000.00")).toBe(200000);
    expect(decimalToKobo("0.1")).toBe(10);
    expect(decimalToKobo("1234.56")).toBe(123456);
  });
});

describe("refund references", () => {
  it("round-trips the charge reference, including colons inside it", () => {
    const ref = refundReference("reg_abc_12345678", 50000);
    expect(chargeRefFromRefundReference(ref)).toBe("reg_abc_12345678");
    expect(chargeRefFromRefundReference("not-ours")).toBeNull();
  });
});

describe("mapBachsPaymentStatus", () => {
  it("maps known states and leaves unknown ones pending", () => {
    expect(mapBachsPaymentStatus("SUCCEEDED")).toBe("SUCCESS");
    expect(mapBachsPaymentStatus("FAILED")).toBe("FAILED");
    expect(mapBachsPaymentStatus("processing")).toBe("PENDING");
    expect(mapBachsPaymentStatus(undefined)).toBe("PENDING");
  });
});

describe("bachsClient", () => {
  it("opens a checkout in decimal naira with our reference", async () => {
    const fetchMock = vi.fn(async () => json(201, { checkout_id: "chk_1", checkout_url: "https://checkout.bachs.io/c/x" }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await bachsClient.initializeCharge({
      amount: 500000, currency: "NGN", email: "a@b.co", reference: "reg_1", callbackUrl: "https://app/cb", metadata: { userId: "u1" },
    });
    expect(out).toEqual({ authorizationUrl: "https://checkout.bachs.io/c/x", providerReference: "reg_1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sandbox-api.bachs.io/v1/checkout-sessions");
    const sent = JSON.parse(init.body as string);
    expect(sent.pricing).toEqual({ currency: "NGN", amount: "5000.00" });
    expect(sent.reference).toBe("reg_1");
  });

  it("verifies by our reference, and treats no payment yet as pending", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { data: [{ charge_id: "ch_1", status: "SUCCEEDED", amount: "5000.00", currency: "NGN", completed_at: "2026-10-07T10:00:00Z" }] })));
    const paid = await bachsClient.verifyCharge("reg_1");
    expect(paid).toMatchObject({ status: "SUCCESS", amount: 500000, providerReference: "reg_1" });
    expect(paid.paidAt).toEqual(new Date("2026-10-07T10:00:00Z"));

    vi.stubGlobal("fetch", vi.fn(async () => json(200, { data: [] })));
    expect((await bachsClient.verifyCharge("reg_2")).status).toBe("PENDING");
  });

  it("refunds against the charge id Bachs holds, with an idempotency key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, { data: [{ charge_id: "ch_9", status: "SUCCEEDED", amount: "5000.00" }] }))
      .mockResolvedValueOnce(json(201, { status: "processing" }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await bachsClient.refundCharge("reg_1", 500000);
    expect(out).toEqual({ status: "PENDING", providerReference: "reg_1" });
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ charge_id: "ch_9", amount: "5000.00", reference: "refund:reg_1:500000" });
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("refund:reg_1:500000");
  });

  it("refuses to refund a payment it has no record of", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { data: [] })));
    await expect(bachsClient.refundCharge("nope", 100)).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it("does not move money out", async () => {
    await expect((bachsClient.initiateTransfer as () => Promise<unknown>)()).rejects.toThrow(/not enabled/);
  });
});

describe("verifyBachsSignature", () => {
  const body = '{"type":"collection.succeeded"}';
  const now = 1_800_000_000;
  const sign = (ts: number, b = body) => createHmac("sha256", "whsec_test").update(`${ts}.${b}`).digest("hex");

  it("accepts a correct, fresh signature", () => {
    expect(verifyBachsSignature(body, String(now), sign(now), now + 10)).toBe(true);
  });
  it("rejects a wrong signature, a tampered body, and missing headers", () => {
    expect(verifyBachsSignature(body, String(now), "0".repeat(64), now)).toBe(false);
    expect(verifyBachsSignature(body + " ", String(now), sign(now), now)).toBe(false);
    expect(verifyBachsSignature(body, null, sign(now), now)).toBe(false);
    expect(verifyBachsSignature(body, String(now), null, now)).toBe(false);
  });
  it("rejects a replay outside five minutes", () => {
    expect(verifyBachsSignature(body, String(now), sign(now), now + 301)).toBe(false);
    expect(verifyBachsSignature(body, String(now), sign(now), now - 301)).toBe(false);
  });
});

describe("shouldFallBack", () => {
  it("falls back for outages and auth problems, not for a bad request", () => {
    expect(shouldFallBack(new Error("fetch failed"))).toBe(true);
    expect(shouldFallBack(new ProviderRequestError("down", 503))).toBe(true);
    expect(shouldFallBack(new ProviderRequestError("bad key", 401))).toBe(true);
    expect(shouldFallBack(new ProviderRequestError("slow down", 429))).toBe(true);
    expect(shouldFallBack(new ProviderRequestError("invalid email", 422))).toBe(false);
  });
});

describe("initializeChargeWithFallback", () => {
  const input = { amount: 100000, currency: "NGN" as const, email: "a@b.co", reference: "r1", callbackUrl: "https://app/cb" };

  it("uses Bachs when it works", async () => {
    process.env.PAYMENT_PRIMARY_PROVIDER = "BACHS";
    vi.stubGlobal("fetch", vi.fn(async () => json(201, { checkout_url: "https://checkout.bachs.io/c/ok" })));
    const out = await initializeChargeWithFallback(input);
    expect(out.provider.name).toBe("BACHS");
  });

  it("falls back to Paystack when Bachs is down, and reports Paystack as the provider", async () => {
    process.env.PAYMENT_PRIMARY_PROVIDER = "BACHS";
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("bachs.io") ? json(503, { message: "unavailable" }) : json(200, { status: true, data: { authorization_url: "https://paystack/x", reference: "r1" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await initializeChargeWithFallback(input);
    expect(out.provider.name).toBe("PAYSTACK");
    expect(out.charge.authorizationUrl).toBe("https://paystack/x");
  });

  it("does not fall back on a bad request", async () => {
    process.env.PAYMENT_PRIMARY_PROVIDER = "BACHS";
    const fetchMock = vi.fn(async () => json(422, { message: "invalid" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(initializeChargeWithFallback(input)).rejects.toBeInstanceOf(ProviderRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("defaults to Paystack with no fallback until Bachs is switched on", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { status: true, data: { authorization_url: "u", reference: "r1" } })));
    expect((await initializeChargeWithFallback(input)).provider.name).toBe("PAYSTACK");
  });

  it("keeps payouts on Paystack even when Bachs collects", () => {
    process.env.PAYMENT_PRIMARY_PROVIDER = "BACHS";
    expect(getPayoutProvider().name).toBe("PAYSTACK");
  });
});
