/**
 * Circuit — pay for a Marketplace listing by card. Holds the unit, then returns the provider's hosted checkout
 * address for the browser to open. The order is confirmed when the provider confirms the payment, not here.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { buyerGate } from "@/lib/marketplaceGate";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";
import { AbandonedError } from "@/lib/keyedLock";
import { OrderError } from "@/lib/marketplaceOrders";
import { startCardCheckout } from "@/lib/marketplaceCheckout";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to buy." }, { status: 401 });
  const blocked = buyerGate(user);
  if (blocked) return blocked;

  const body = await request.json().catch(() => null);
  if (typeof body?.listingId !== "string") return NextResponse.json({ error: "Missing listing." }, { status: 400 });

  // Starting a checkout holds a unit, so it has its own, tighter limit than a wallet purchase.
  const key = `marketplace-card-checkout:${user.id}`;
  const { limited } = await isRateLimited(key, { max: 10, windowMs: 60 * 60 * 1000 });
  if (limited) return NextResponse.json({ error: "Too many card payments started. Try again shortly." }, { status: 429 });
  await recordAttempt(key);

  try {
    const { orderId, authorizationUrl } = await startCardCheckout(user, { listingId: body.listingId, note: body.note }, { signal: request.signal });
    return NextResponse.json({ id: orderId, authorizationUrl }, { status: 201 });
  } catch (err) {
    if (err instanceof OrderError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof AbandonedError) return new NextResponse(null, { status: 499 });
    throw err;
  }
}
