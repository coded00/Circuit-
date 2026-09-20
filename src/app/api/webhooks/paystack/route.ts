import { NextResponse } from "next/server";
import { confirmEntryFeePayment, confirmWalletFunding } from "@/lib/payments/confirm";
import { verifyPaystackSignature } from "@/lib/payments/webhookVerification";
import { captureMessage, captureException } from "@/lib/observability";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyPaystackSignature(rawBody, signature)) {
    // A rejected signature is either a misconfigured PAYSTACK_SECRET_KEY
    // or a forged webhook attempt — previously invisible either way (a
    // plain 401 return, nothing logged). A flood of these is exactly the
    // kind of thing that should be noticed, not silently swallowed.
    captureMessage("Paystack webhook rejected: invalid signature", "warning");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    // A validly-signed but malformed body — shouldn't happen from the
    // real Paystack, but a thrown JSON.parse previously became an
    // uncaught 500 instead of a clean, logged response.
    captureException(err, { source: "webhooks/paystack", reason: "malformed JSON body" });
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }
  const reference = event?.data?.reference;

  // Both confirm functions are no-ops for a reference they don't own (a
  // Registration lookup miss, or a WalletTransaction lookup miss) — safe
  // to try both rather than parsing the reference's own prefix to decide.
  if (event?.event === "charge.success" && typeof reference === "string") {
    try {
      await confirmEntryFeePayment(reference);
      await confirmWalletFunding(reference);
    } catch (err) {
      // V1 audit follow-up: previously an uncaught throw here became a
      // generic 500 with no monitoring context — a real failure
      // confirming a live entry-fee/wallet-funding payment was invisible.
      // Still rethrown (not swallowed): the 500 makes Paystack retry this
      // webhook later, which is the actual recovery path.
      captureException(err, { source: "webhooks/paystack", reference });
      throw err;
    }
  }

  // Always 200 once the signature checks out — anything else makes
  // Paystack retry, and an event we don't act on (wrong type, unknown
  // reference) is still a successfully handled webhook from its perspective.
  return NextResponse.json({ received: true });
}
