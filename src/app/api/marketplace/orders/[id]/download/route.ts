/**
 * Circuit — the download button for an instantly delivered order. Only the
 * buyer of a delivered order gets through; they are sent on to the file's own
 * host, so the file's bytes never pass through (or sit on) Circuit.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to download." }, { status: 401 });

  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id }, select: { buyerId: true, status: true, listing: { select: { deliveryUrl: true } } } });
  if (!order || order.buyerId !== user.id) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.status !== "FULFILLED" || !order.listing.deliveryUrl) return NextResponse.json({ error: "There's no download for this order." }, { status: 404 });

  return NextResponse.redirect(order.listing.deliveryUrl, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
