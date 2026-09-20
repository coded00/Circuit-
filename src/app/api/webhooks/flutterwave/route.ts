import { NextResponse } from "next/server";
import { confirmEntryFeePayment, confirmWalletFunding } from "@/lib/payments/confirm";
import { verifyFlutterwaveSignature } from "@/lib/payments/webhookVerification";
import { captureMessage } from "@/lib/observability";

export async function POST(request: Request) {
  const hash = request.headers.get("verif-hash");

  if (!verifyFlutterwaveSignature(hash)) {
    // Same reasoning as the Paystack webhook's own comment — a rejected
    // signature was previously invisible (a plain 401, nothing logged).
    captureMessage("Flutterwave webhook rejected: invalid signature", "warning");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = await request.json().catch(() => null);
  const reference = event?.data?.tx_ref;

  // Both confirm functions are no-ops for a reference they don't own —
  // safe to try both rather than parsing the reference's own prefix.
  if (event?.event === "charge.completed" && typeof reference === "string") {
    await confirmEntryFeePayment(reference);
    await confirmWalletFunding(reference);
  }

  return NextResponse.json({ received: true });
}
