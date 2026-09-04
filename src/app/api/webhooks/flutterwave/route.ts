import { NextResponse } from "next/server";
import { confirmEntryFeePayment } from "@/lib/payments/confirm";
import { verifyFlutterwaveSignature } from "@/lib/payments/webhookVerification";

export async function POST(request: Request) {
  const hash = request.headers.get("verif-hash");

  if (!verifyFlutterwaveSignature(hash)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = await request.json().catch(() => null);
  const reference = event?.data?.tx_ref;

  if (event?.event === "charge.completed" && typeof reference === "string") {
    await confirmEntryFeePayment(reference);
  }

  return NextResponse.json({ received: true });
}
