/**
 * Circuit — manage a Marketplace listing: edit its details, or pause,
 * resume, mark sold or remove it. The seller can do this to their own
 * listing; staff can do it to any (that is the admin Marketplace screen).
 * Removing is a status change, not a delete.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseListingInput } from "@/lib/marketplace";

const STATUSES = ["ACTIVE", "PAUSED", "SOLD", "REMOVED"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);

  const listing = await prisma.listing.findUnique({ where: { id }, select: { sellerId: true, status: true } });
  if (!listing || (listing.sellerId !== user.id && !user.isStaff)) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  // Only staff can bring back a removed listing.
  if (listing.status === "REMOVED" && !user.isStaff) return NextResponse.json({ error: "This listing was removed." }, { status: 409 });

  if (typeof body?.status === "string") {
    const status = STATUSES.find((s) => s === body.status);
    if (!status) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    if (status === "ACTIVE" && user.isSuspended) return NextResponse.json({ error: "Your account is suspended." }, { status: 403 });
    await prisma.listing.update({ where: { id }, data: { status } });
    return NextResponse.json({ ok: true });
  }

  const parsed = parseListingInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await prisma.listing.update({ where: { id }, data: parsed.value });
  return NextResponse.json({ ok: true });
}
