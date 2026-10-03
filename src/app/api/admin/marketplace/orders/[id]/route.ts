/**
 * Circuit — staff handle a Marketplace order: mark it delivered (with a note
 * the buyer can read) or cancel it and refund the buyer's wallet.
 */

import { NextResponse, after } from "next/server";
import { requireStaff } from "@/lib/session";
import { cancelOrder, fulfilOrder } from "@/lib/marketplaceOrders";
import { notify } from "@/lib/notifications";
import { emailOrderDelivered, emailOrderRefunded } from "@/lib/orderEmails";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : null;

  if (body?.action === "fulfil") {
    const order = await fulfilOrder(id, note);
    if (!order) return NextResponse.json({ error: "This order isn't waiting for delivery." }, { status: 409 });
    await notify(order.buyerId, "ORDER_FULFILLED", { orderId: order.id, title: order.listingTitle }).catch(() => undefined);
    after(() => emailOrderDelivered(order));
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "cancel") {
    const order = await cancelOrder(id, note);
    if (!order) return NextResponse.json({ error: "This order isn't waiting for delivery." }, { status: 409 });
    await notify(order.buyerId, "ORDER_CANCELLED", { orderId: order.id, title: order.listingTitle }).catch(() => undefined);
    after(() => emailOrderRefunded(order));
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "refund") {
    const order = await cancelOrder(id, note, { refundDelivered: true });
    if (!order) return NextResponse.json({ error: "This order can't be refunded." }, { status: 409 });
    await notify(order.buyerId, "ORDER_CANCELLED", { orderId: order.id, title: order.listingTitle }).catch(() => undefined);
    after(() => emailOrderRefunded(order));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
