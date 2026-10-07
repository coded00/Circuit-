import { NextResponse } from "next/server";
import { confirmEntryFeePayment, confirmWalletFunding } from "@/lib/payments/confirm";
import { confirmMarketplacePayment } from "@/lib/marketplaceCheckout";
import { applyMarketplaceRefundOutcome } from "@/lib/marketplaceCardRefund";
import { verifyBachsSignature } from "@/lib/payments/webhookVerification";
import { applyRefundOutcome } from "@/lib/payments/transfers";
import { chargeRefFromRefundReference, referenceForCheckout } from "@/lib/payments/bachs";
import { captureMessage, captureException } from "@/lib/observability";

// Events handled here (subscribe to these on the Bachs dashboard):
// - collection.succeeded / checkout.completed: an entry fee, wallet deposit or marketplace card payment was paid.
//   Only a pointer to which reference to re-verify with Bachs, same as the other providers: the payload alone
//   never confirms a payment.
// - refund.paid / refund.failed: a refund finished. Our refund reference carries the charge reference.
// Payout events are not handled: payouts do not run on Bachs. Anything else is acknowledged and ignored.
// Delivery is at-least-once, and every handler below is idempotent.

type BachsEvent = {
  id?: string;
  type?: string;
  data?: {
    reference?: string | null;
    checkout_id?: string;
    payment_status?: string;
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifyBachsSignature(rawBody, request.headers.get("x-bachs-timestamp"), request.headers.get("x-bachs-signature"))) {
    captureMessage("Bachs webhook rejected: invalid signature", "warning");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: BachsEvent;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    captureException(err, { source: "webhooks/bachs", reason: "malformed JSON body" });
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  const type = event?.type ?? "";
  try {
    if (type === "collection.succeeded" || (type === "checkout.completed" && event.data?.payment_status === "paid")) {
      // collection.succeeded carries the checkout id but not always our reference: ask Bachs for it.
      const reference =
        event.data?.reference ?? (event.data?.checkout_id ? await referenceForCheckout(event.data.checkout_id) : null);
      if (typeof reference === "string") {
        await confirmEntryFeePayment(reference);
        await confirmWalletFunding(reference);
        await confirmMarketplacePayment(reference);
      }
    } else if (type === "refund.paid" || type === "refund.failed") {
      const chargeRef = chargeRefFromRefundReference(event.data?.reference ?? "");
      if (chargeRef) {
        const outcome = type === "refund.paid" ? "SUCCESS" : "FAILED";
        await applyRefundOutcome(chargeRef, outcome);
        await applyMarketplaceRefundOutcome(chargeRef, outcome);
      }
    }
  } catch (err) {
    // Rethrown so Bachs gets a 5xx and redelivers.
    captureException(err, { source: "webhooks/bachs", event: type, eventId: event?.id });
    throw err;
  }

  return NextResponse.json({ received: true });
}
