/**
 * Circuit — create a Marketplace listing. Listing only: nothing here moves
 * money (there is no checkout yet).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";
import { LISTING_MAX_LIVE_PER_SELLER, canSell, parseListingInput } from "@/lib/marketplace";

const CREATE_MAX_ATTEMPTS = 10;
const CREATE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in to sell." }, { status: 401 });
  if (user.isSuspended) {
    return NextResponse.json({ error: `Your account is suspended: ${user.suspensionReason ?? "contact support."}` }, { status: 403 });
  }

  if (!canSell(user)) return NextResponse.json({ error: "Only Circuit can sell on the Marketplace for now." }, { status: 403 });

  const parsed = parseListingInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const key = `listing-create:${user.id}`;
  const { limited } = await isRateLimited(key, { max: CREATE_MAX_ATTEMPTS, windowMs: CREATE_WINDOW_MS });
  if (limited) return NextResponse.json({ error: "You've listed a lot recently. Try again in a while." }, { status: 429 });

  const live = await prisma.listing.count({ where: { sellerId: user.id, status: { in: ["ACTIVE", "PAUSED"] } } });
  if (live >= LISTING_MAX_LIVE_PER_SELLER) {
    return NextResponse.json({ error: `You can have up to ${LISTING_MAX_LIVE_PER_SELLER} live listings. Remove or sell one first.` }, { status: 409 });
  }
  await recordAttempt(key);

  const listing = await prisma.listing.create({ data: { ...parsed.value, sellerId: user.id }, select: { id: true } });
  return NextResponse.json({ id: listing.id }, { status: 201 });
}
