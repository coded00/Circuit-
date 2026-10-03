import { NextResponse } from "next/server";
import { confirmEntryFeePayment, confirmWalletFunding } from "@/lib/payments/confirm";
import { verifyPaystackSignature } from "@/lib/payments/webhookVerification";
import { applyRefundOutcome, applyTransferOutcome } from "@/lib/payments/transfers";
import { paystackClient } from "@/lib/payments/paystack";
import { captureMessage, captureException } from "@/lib/observability";

// Events handled here (subscribe to these on the Paystack dashboard):
// - charge.success — an entry fee or wallet deposit was paid.
// - transfer.success / transfer.failed / transfer.reversed — a withdrawal
//   or prize payout finished. Re-verified with Paystack before it's
//   recorded, same as charges.
// - refund.processed / refund.failed — an entry-fee refund finished.
// Anything else is acknowledged and ignored.
const TRANSFER_EVENTS = new Set(["transfer.success", "transfer.failed", "transfer.reversed"]);

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

  let event: {
    event?: string;
    data?: { reference?: string; transaction_reference?: string; transaction?: { reference?: string } };
  };
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
  const type = event?.event ?? "";
  try {
    if (type === "charge.success" && typeof reference === "string") {
      await confirmEntryFeePayment(reference);
      await confirmWalletFunding(reference);
    } else if (TRANSFER_EVENTS.has(type) && typeof reference === "string") {
      const status = await paystackClient.verifyTransfer(reference);
      if (status !== "PENDING") await applyTransferOutcome(reference, status);
    } else if (type === "refund.processed" || type === "refund.failed") {
      const chargeRef = event.data?.transaction_reference ?? event.data?.transaction?.reference;
      if (typeof chargeRef === "string") await applyRefundOutcome(chargeRef, type === "refund.processed" ? "SUCCESS" : "FAILED");
    }
  } catch (err) {
    // Rethrown so Paystack gets a 5xx and retries; every handler above is idempotent.
    captureException(err, { source: "webhooks/paystack", event: type, reference });
    throw err;
  }

  return NextResponse.json({ received: true });
}
