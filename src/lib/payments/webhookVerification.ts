/**
 * Circuit — webhook signature verification for Paystack and Flutterwave.
 *
 * Neither provider's payload is trusted on its own (REG-2, NFR-3) — a
 * webhook only tells confirmEntryFeePayment() which reference to
 * re-verify via that provider's own API, never confirms a payment by
 * itself. This module's only job is deciding whether a webhook request
 * genuinely came from the provider it claims to.
 */

import { createHmac, timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Paystack signs the raw request body with HMAC-SHA512 over your secret key. */
export function verifyPaystackSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signatureHeader);
}

/** Flutterwave sends back a static hash configured in their dashboard —
 *  a direct comparison, not an HMAC over the body. */
export function verifyFlutterwaveSignature(hashHeader: string | null): boolean {
  if (!hashHeader) return false;
  const secret = process.env.FLUTTERWAVE_SECRET_HASH;
  if (!secret) return false;
  return safeEqual(secret, hashHeader);
}
