import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import { verifyPaystackSignature, verifyFlutterwaveSignature } from "./webhookVerification";

/**
 * A rejected webhook signature is either a misconfigured secret or a
 * forged request — the one thing standing between "this payload is
 * trusted" and "an attacker can fabricate a charge.success event and
 * have confirmEntryFeePayment act on it." These tests exist because a
 * subtle bug here (wrong algorithm, wrong header, a non-constant-time
 * comparison) is exactly the kind of thing that looks correct on a quick
 * read and is expensive to get wrong.
 */

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = "sk_test_paystack_secret";
  process.env.FLUTTERWAVE_SECRET_HASH = "flw_test_secret_hash";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("verifyPaystackSignature", () => {
  it("accepts a correctly-signed body", () => {
    const rawBody = JSON.stringify({ event: "charge.success", data: { reference: "ref_123" } });
    const signature = createHmac("sha512", "sk_test_paystack_secret").update(rawBody).digest("hex");
    expect(verifyPaystackSignature(rawBody, signature)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const rawBody = JSON.stringify({ event: "charge.success" });
    const wrongSignature = createHmac("sha512", "not-the-real-secret").update(rawBody).digest("hex");
    expect(verifyPaystackSignature(rawBody, wrongSignature)).toBe(false);
  });

  it("rejects a signature computed over a different body (tampered payload)", () => {
    const originalBody = JSON.stringify({ event: "charge.success", data: { reference: "ref_123" } });
    const signature = createHmac("sha512", "sk_test_paystack_secret").update(originalBody).digest("hex");
    const tamperedBody = JSON.stringify({ event: "charge.success", data: { reference: "ref_999" } });
    expect(verifyPaystackSignature(tamperedBody, signature)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyPaystackSignature("{}", null)).toBe(false);
  });

  it("rejects an empty signature header", () => {
    expect(verifyPaystackSignature("{}", "")).toBe(false);
  });

  it("fails closed (rejects everything) when PAYSTACK_SECRET_KEY isn't configured", () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const rawBody = "{}";
    // Even a signature that would've been valid under some other secret
    // must not be accepted just because the server has none configured.
    const signature = createHmac("sha512", "").update(rawBody).digest("hex");
    expect(verifyPaystackSignature(rawBody, signature)).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    // timingSafeEqual throws on mismatched buffer lengths if not guarded —
    // confirms safeEqual's own length check is actually reached.
    expect(() => verifyPaystackSignature("{}", "too-short")).not.toThrow();
    expect(verifyPaystackSignature("{}", "too-short")).toBe(false);
  });
});

describe("verifyFlutterwaveSignature", () => {
  it("accepts the configured secret hash", () => {
    expect(verifyFlutterwaveSignature("flw_test_secret_hash")).toBe(true);
  });

  it("rejects any other value", () => {
    expect(verifyFlutterwaveSignature("guessed-hash")).toBe(false);
  });

  it("rejects a missing hash header", () => {
    expect(verifyFlutterwaveSignature(null)).toBe(false);
  });

  it("fails closed when FLUTTERWAVE_SECRET_HASH isn't configured", () => {
    delete process.env.FLUTTERWAVE_SECRET_HASH;
    expect(verifyFlutterwaveSignature("anything")).toBe(false);
  });

  it("rejects a value of different length without throwing", () => {
    expect(() => verifyFlutterwaveSignature("short")).not.toThrow();
    expect(verifyFlutterwaveSignature("short")).toBe(false);
  });
});
