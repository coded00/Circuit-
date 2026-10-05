/**
 * Circuit — paying for a Marketplace order by card.
 *
 *   1. startCardCheckout   the order is created PENDING_PAYMENT, the unit is held for CARD_HOLD_MINUTES, and the
 *                          buyer is sent to the provider's hosted checkout.
 *   2. confirmMarketplacePayment   called by the provider's webhook and by the page the buyer returns to. It
 *                          re-verifies the charge with the provider (never trusting the redirect or the payload)
 *                          and only then marks the order PAID. Safe to call any number of times.
 *   3. expireUnpaidOrders  the sweep releases units whose payment never arrived. A payment that arrives for an
 *                          order that has already been released is refunded to the card, not kept.
 *
 * A wallet order is debited and PAID at once (placeOrder). Nothing here touches the wallet.
 */
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { withKeyedLock } from "@/lib/keyedLock";
import { getDefaultPaymentProvider, getPaymentProvider, toCheckoutEmail } from "@/lib/payments";
import { captureException } from "@/lib/observability";
import { notify } from "@/lib/notifications";
import { OrderError, loadPurchasableListing } from "@/lib/marketplaceOrders";
import { refundCardOrder } from "@/lib/marketplaceCardRefund";
import { emailOrderReceipt } from "@/lib/orderEmails";

export const CARD_HOLD_MINUTES = 20;
const MAX_OPEN_CARD_ORDERS = 2;

export async function startCardCheckout(
  buyer: { id: string; isSuspended: boolean; emailOrPhone: string },
  input: { listingId: string; note?: unknown },
  options: { signal?: AbortSignal } = {},
): Promise<{ orderId: string; authorizationUrl: string }> {
  const { listing, note } = await loadPurchasableListing(buyer, input);

  // Holding a unit costs the seller a sale while the buyer decides, so only a couple can be held at once per buyer.
  const open = await prisma.order.count({ where: { buyerId: buyer.id, status: "PENDING_PAYMENT", reservedUntil: { gt: new Date() } } });
  if (open >= MAX_OPEN_CARD_ORDERS) {
    throw new OrderError(`You already have card payments in progress. Finish them, or wait ${CARD_HOLD_MINUTES} minutes for them to expire, before starting another.`, 409);
  }

  const provider = getDefaultPaymentProvider();
  const reference = `mkt_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const reservedUntil = new Date(Date.now() + CARD_HOLD_MINUTES * 60_000);

  // Orders for one listing queue here, not on the database row lock (see keyedLock).
  const order = await withKeyedLock(
    `listing:${listing.id}`,
    () =>
      prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            listingId: listing.id,
            buyerId: buyer.id,
            listingTitle: listing.title,
            category: listing.category,
            amountKobo: listing.priceKobo,
            buyerNote: note || null,
            status: "PENDING_PAYMENT",
            paymentMethod: "CARD",
            paymentProvider: provider.name,
            paymentRef: reference,
            reservedUntil,
          },
        });
        if (listing.stock !== null) {
          const taken = await tx.listing.updateMany({ where: { id: listing.id, status: "ACTIVE", stock: { gt: 0 } }, data: { stock: { decrement: 1 } } });
          if (taken.count === 0) throw new OrderError("Sold out.", 409); // rolls the order back too
          const left = await tx.listing.findUnique({ where: { id: listing.id }, select: { stock: true } });
          if (left?.stock === 0) await tx.listing.update({ where: { id: listing.id }, data: { status: "SOLD" } }); // the last unit is held
        }
        return created;
      }),
    options.signal,
  );

  try {
    const charge = await provider.initializeCharge({
      amount: order.amountKobo,
      currency: "NGN",
      email: toCheckoutEmail(buyer.emailOrPhone, buyer.id),
      reference,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/marketplace/orders/${order.id}?paid=1`,
      metadata: { orderId: order.id, userId: buyer.id, purpose: "marketplace_order" },
    });
    return { orderId: order.id, authorizationUrl: charge.authorizationUrl };
  } catch (err) {
    captureException(err, { source: "marketplace:startCardCheckout", orderId: order.id });
    await releaseReservation(order.id, "The card payment couldn't be started.");
    throw new OrderError("We couldn't start the card payment. Please try again.", 502);
  }
}

/** Gives a held unit back and closes the order. False if the order wasn't waiting for payment (already settled). */
export async function releaseReservation(orderId: string, note: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const closed = await tx.order.updateMany({
      where: { id: orderId, status: "PENDING_PAYMENT" },
      data: { status: "CANCELLED", cancelledAt: new Date(), fulfilmentNote: note, reservedUntil: null },
    });
    if (closed.count === 0) return false;
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { listingId: true } });
    const listing = await tx.listing.findUnique({ where: { id: order.listingId }, select: { stock: true, status: true } });
    if (listing && listing.stock !== null) {
      await tx.listing.update({
        where: { id: order.listingId },
        data: { stock: { increment: 1 }, ...(listing.stock === 0 && listing.status === "SOLD" ? { status: "ACTIVE" } : {}) },
      });
    }
    return true;
  });
}

export type PaymentOutcome = "UNKNOWN" | "ALREADY_SETTLED" | "STILL_PENDING" | "CONFIRMED" | "FAILED" | "REFUNDED";

export async function confirmMarketplacePayment(reference: string): Promise<PaymentOutcome> {
  const order = await prisma.order.findUnique({ where: { paymentRef: reference }, include: { listing: { select: { deliveryUrl: true } } } });
  if (!order || order.paymentMethod !== "CARD" || !order.paymentProvider) return "UNKNOWN";
  if (order.status === "PAID" || order.status === "FULFILLED") return "ALREADY_SETTLED";
  if (order.refundRef) return "REFUNDED"; // this charge has already been given back

  const result = await getPaymentProvider(order.paymentProvider).verifyCharge(reference);
  if (result.status === "FAILED") {
    if (order.status === "PENDING_PAYMENT") await releaseReservation(order.id, "The card payment didn't go through.");
    return "FAILED";
  }
  if (result.status !== "SUCCESS") return "STILL_PENDING";

  if (order.status === "PENDING_PAYMENT" && result.amount === order.amountKobo) {
    const instant = !!order.listing.deliveryUrl;
    // The real guard: only the call that flips PENDING_PAYMENT does the rest, so a webhook and the return page can't both.
    const claimed = await prisma.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: { status: instant ? "FULFILLED" : "PAID", reservedUntil: null, ...(instant ? { fulfilledAt: new Date(), fulfilmentNote: "Your download is ready." } : {}) },
    });
    if (claimed.count === 0) return "ALREADY_SETTLED";
    void emailOrderReceipt({ ...order, status: instant ? "FULFILLED" : "PAID" }, instant);
    await notify(order.buyerId, "ORDER_PAID", { orderId: order.id, title: order.listingTitle, instant }).catch(() => undefined);
    return "CONFIRMED";
  }

  // The buyer paid, but this order can't take the payment: it was already released (the hold ran out), or the amount
  // paid isn't the price. Either way the money goes straight back to the card.
  if (order.status === "PENDING_PAYMENT") await releaseReservation(order.id, "The amount paid didn't match the price, so it was refunded.");
  const claimed = await prisma.order.updateMany({ where: { id: order.id, refundRef: null }, data: { refundRef: `refund_${reference}`, refundStatus: "PENDING" } });
  if (claimed.count === 0) return "REFUNDED";
  try {
    const refund = await getPaymentProvider(order.paymentProvider).refundCharge(reference, result.amount);
    await prisma.order.update({ where: { id: order.id }, data: { refundStatus: refund.status === "SUCCESS" ? "COMPLETE" : "PENDING" } });
  } catch (err) {
    // Undo the claim so the provider's next webhook delivery (or the sweep) tries again.
    await prisma.order.update({ where: { id: order.id }, data: { refundRef: null, refundStatus: null } });
    throw err;
  }
  return "REFUNDED";
}

/**
 * Sweep step: releases card orders whose hold has run out. Before releasing, the charge is checked once more with
 * the provider, in case the payment went through and only its webhook is late.
 */
export async function expireUnpaidOrders(): Promise<{ released: number; confirmed: number; errors?: string[] }> {
  const due = await prisma.order.findMany({
    where: { status: "PENDING_PAYMENT", reservedUntil: { lt: new Date() } },
    orderBy: { reservedUntil: "asc" },
    take: 50,
    select: { id: true, paymentRef: true },
  });
  let released = 0;
  let confirmed = 0;
  const errors: string[] = [];
  for (const order of due) {
    try {
      if (order.paymentRef && (await confirmMarketplacePayment(order.paymentRef)) === "CONFIRMED") {
        confirmed++;
        continue;
      }
      if (await releaseReservation(order.id, "The payment wasn't completed in time.")) released++;
    } catch (err) {
      captureException(err, { source: "sweep:expireUnpaidOrders", orderId: order.id });
      errors.push(`marketplaceOrder:${order.id}`);
    }
  }
  return { released, confirmed, ...(errors.length > 0 ? { errors } : {}) };
}

export { refundCardOrder };
