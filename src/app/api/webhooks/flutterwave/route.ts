import { NextResponse } from "next/server";
import { confirmEntryFeePayment, confirmWalletFunding } from "@/lib/payments/confirm";
import { verifyFlutterwaveSignature } from "@/lib/payments/webhookVerification";
import { captureMessage, captureException } from "@/lib/observability";

export async function POST(request: Request) {
  const hash = request.headers.get("verif-hash");

  if (!verifyFlutterwaveSignature(hash)) {
    // Same reasoning as the Paystack webhook's own comment — a rejected
    // signature was previously invisible (a plain 401, nothing logged).
    captureMessage("Flutterwave webhook rejected: invalid signature", "warning");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // V1 audit follow-up: this used to swallow a malformed body with
  // nothing logged at all — unlike the Paystack webhook's equivalent
  // (which does capture this). A validly-signed but malformed body
  // shouldn't happen from the real Flutterwave, but silently dropping it
  // left no trace to debug from if it ever did.
  const event = await request.json().catch((err) => {
    captureException(err, { source: "webhooks/flutterwave", reason: "malformed JSON body" });
    return null;
  });
  const reference = event?.data?.tx_ref;

  // Both confirm functions are no-ops for a reference they don't own —
  // safe to try both rather than parsing the reference's own prefix.
  if (event?.event === "charge.completed" && typeof reference === "string") {
    try {
      await confirmEntryFeePayment(reference);
      await confirmWalletFunding(reference);
    } catch (err) {
      // Same reasoning as the Paystack webhook's own comment — still
      // rethrown so Flutterwave retries, not swallowed.
      captureException(err, { source: "webhooks/flutterwave", reference });
      throw err;
    }
  }

  return NextResponse.json({ received: true });
}
