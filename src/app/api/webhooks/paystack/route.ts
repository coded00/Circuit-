import { NextResponse } from "next/server";
import { confirmEntryFeePayment, confirmWalletFunding } from "@/lib/payments/confirm";
import { verifyPaystackSignature } from "@/lib/payments/webhookVerification";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyPaystackSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const reference = event?.data?.reference;

  // Both confirm functions are no-ops for a reference they don't own (a
  // Registration lookup miss, or a WalletTransaction lookup miss) — safe
  // to try both rather than parsing the reference's own prefix to decide.
  if (event?.event === "charge.success" && typeof reference === "string") {
    await confirmEntryFeePayment(reference);
    await confirmWalletFunding(reference);
  }

  // Always 200 once the signature checks out — anything else makes
  // Paystack retry, and an event we don't act on (wrong type, unknown
  // reference) is still a successfully handled webhook from its perspective.
  return NextResponse.json({ received: true });
}
