import { NextResponse } from "next/server";
import { confirmEntryFeePayment, confirmWalletFunding } from "@/lib/payments/confirm";
import { confirmMarketplacePayment } from "@/lib/marketplaceCheckout";
import { verifyFlutterwaveSignature } from "@/lib/payments/webhookVerification";
import { applyTransferOutcome } from "@/lib/payments/transfers";
import { flutterwaveClient } from "@/lib/payments/flutterwave";
import { captureMessage, captureException } from "@/lib/observability";

// Events handled here (subscribe to these on the Flutterwave dashboard):
// - charge.completed — an entry fee or wallet deposit was paid. The reference
//   is the charge's own, in `data.tx_ref`, and both outcomes arrive under this
//   one event name — success or failure is in `data.status`.
// - transfer.completed — a withdrawal or prize payout finished. The reference
//   is in `data.reference` (a transfer payload has no `tx_ref` at all, so the
//   charge field is the wrong one to read here) and the status is upper-case
//   "SUCCESSFUL" / "FAILED", unlike a charge's lower-case pair.
// Anything else is acknowledged and ignored.
//
// Finding #20. This route used to handle charge.completed and nothing else,
// which left every transfer to the sweep's 30-minute reconciliation — money
// out of a player's wallet and unsettled for half an hour on a good day, and
// for as long as the sweep's own backstop kept failing on a bad one. The
// Paystack route has always handled transfers; this is the same handler,
// under the same re-verify-before-recording rule.
//
// Refunds are the one thing that could not be mirrored: Flutterwave's refund
// webhook carries no `event` field to key on at all, so there is nothing to
// subscribe to. A Flutterwave refund still settles through the sweep
// (reconcilePendingMoney), which is where a missed webhook falls back to
// anyway — and that sweep now alerts when money stays unsettled too long.
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
  const transferReference = event?.data?.reference;

  // Every handler below is a no-op for a reference it doesn't own — the
  // confirm functions on a lookup miss, applyTransferOutcome on a reference
  // no row carries — so each one can be tried rather than parsing the
  // reference's own prefix to decide which kind of event this is.
  try {
    if (event?.event === "charge.completed" && typeof reference === "string") {
      await confirmEntryFeePayment(reference);
      await confirmWalletFunding(reference);
      await confirmMarketplacePayment(reference);
    } else if (event?.event === "transfer.completed" && typeof transferReference === "string") {
      // Re-verified with Flutterwave before it is recorded, exactly as a
      // charge is: the payload is only a hint about which transfer to ask
      // about, never the answer itself. A webhook that never arrives, or one
      // that arrives for a transfer Flutterwave has no record of, leaves the
      // row for the sweep rather than moving money on the strength of it.
      const status = await flutterwaveClient.verifyTransfer(transferReference);
      if (status !== "PENDING") await applyTransferOutcome(transferReference, status);
    }
  } catch (err) {
    // Same reasoning as the Paystack webhook's own comment — still
    // rethrown so Flutterwave retries, not swallowed.
    captureException(err, {
      source: "webhooks/flutterwave",
      event: event?.event,
      reference: typeof reference === "string" ? reference : transferReference,
    });
    throw err;
  }

  return NextResponse.json({ received: true });
}
