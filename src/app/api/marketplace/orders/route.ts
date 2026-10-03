/**
 * Circuit — buy a Marketplace listing from the wallet. A money action, so it
 * carries the same verified-email and age checks as paid entries and stakes.
 */

import { NextResponse, after } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { emailVerificationRequired } from "@/lib/emailGate";
import { AgeGateError, assertAgeGate } from "@/lib/age-gate";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";
import { OrderError, placeOrder } from "@/lib/marketplaceOrders";
import { emailOrderReceipt } from "@/lib/orderEmails";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to buy." }, { status: 401 });

  const unverified = emailVerificationRequired(user);
  if (unverified) return unverified;
  try {
    assertAgeGate(user.dateOfBirth);
  } catch (err) {
    if (err instanceof AgeGateError) {
      return NextResponse.json({ error: err.code === "MISSING_DOB" ? "Add your date of birth in your account settings before buying." : err.message }, { status: 403 });
    }
    throw err;
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.listingId !== "string") return NextResponse.json({ error: "Missing listing." }, { status: 400 });

  const key = `marketplace-order:${user.id}`;
  const { limited } = await isRateLimited(key, { max: 20, windowMs: 60 * 60 * 1000 });
  if (limited) return NextResponse.json({ error: "Too many purchases in a short time. Try again shortly." }, { status: 429 });
  await recordAttempt(key);

  try {
    const order = await placeOrder(user, { listingId: body.listingId, note: body.note });
    after(() => emailOrderReceipt(order, order.status === "FULFILLED"));
    return NextResponse.json({ id: order.id }, { status: 201 });
  } catch (err) {
    if (err instanceof OrderError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
