/**
 * Circuit — emails for Marketplace orders: a receipt when an order is paid,
 * a note when it is delivered, and one when it is refunded. Sent through the
 * shared mailer, so without RESEND_API_KEY they are logged to the server
 * console instead, like every other email. Never throws: a mail problem must
 * not undo or fail an order.
 */

import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { formatListingPrice } from "@/lib/marketplace";

type OrderForEmail = { id: string; buyerId: string; listingTitle: string; amountKobo: number; status: string; fulfilmentNote: string | null };

const SITE = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

async function send(order: OrderForEmail, subject: (title: string) => string, body: (link: string) => string) {
  try {
    const buyer = await prisma.user.findUnique({ where: { id: order.buyerId }, select: { email: true, displayName: true } });
    if (!buyer?.email) return;
    const link = `${SITE()}/marketplace/orders/${order.id}`;
    await sendEmail(buyer.email, subject(order.listingTitle), `Hi ${buyer.displayName},\n\n${body(link)}\n\nCircuit`);
  } catch (err) {
    console.error("[order-email] failed", err);
  }
}

export function emailOrderReceipt(order: OrderForEmail, instant: boolean) {
  return send(
    order,
    (title) => `Your Circuit order: ${title}`,
    (link) =>
      `Thanks for your order of ${order.listingTitle} (${formatListingPrice(order.amountKobo)}, paid from your wallet).\n\n` +
      (instant ? "Your download is ready on your order page." : "Circuit is preparing it now. We'll let you know when it is delivered.") +
      `\n\nOrder #${order.id.slice(-8).toUpperCase()}: ${link}`,
  );
}

export function emailOrderDelivered(order: OrderForEmail) {
  return send(
    order,
    (title) => `Delivered: ${title}`,
    (link) => `Your order of ${order.listingTitle} has been delivered.${order.fulfilmentNote ? `\n\n${order.fulfilmentNote}` : ""}\n\nSee it here: ${link}`,
  );
}

export function emailOrderRefunded(order: OrderForEmail) {
  return send(
    order,
    (title) => `Refunded: ${title}`,
    (link) =>
      `Your order of ${order.listingTitle} was cancelled and ${formatListingPrice(order.amountKobo)} went back to your Circuit wallet.${order.fulfilmentNote ? `\n\nNote from Circuit: ${order.fulfilmentNote}` : ""}\n\nDetails: ${link}`,
  );
}
