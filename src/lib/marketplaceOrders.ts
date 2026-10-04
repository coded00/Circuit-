/**
 * Circuit — Marketplace orders. Circuit is the only seller for now, so an
 * order is simple: the buyer pays from their wallet, Circuit delivers and
 * marks it fulfilled (with a note the buyer can read), or cancels it and the
 * money goes back to the wallet. Every wallet change here happens in the same
 * transaction as its WalletTransaction row, like every other wallet movement.
 */

import { withKeyedLock } from "@/lib/keyedLock";
import { prisma } from "@/lib/db";
import { blockedBetween } from "@/lib/blocks";
import { BUYER_NOTE_MAX } from "@/lib/marketplace";

export class OrderError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function placeOrder(buyer: { id: string; isSuspended: boolean }, input: { listingId: string; note?: unknown }, options: { signal?: AbortSignal } = {}) {
  if (buyer.isSuspended) throw new OrderError("Your account is suspended.", 403);

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    include: { seller: { select: { id: true, isSuspended: true } } },
  });
  if (!listing || listing.status !== "ACTIVE" || listing.seller.isSuspended) throw new OrderError("This listing isn't available.", 404);
  if (listing.sellerId === buyer.id) throw new OrderError("You can't buy your own listing.", 400);
  if (await blockedBetween(buyer.id, listing.sellerId)) throw new OrderError("This listing isn't available.", 404);

  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (listing.buyerPrompt && !note) throw new OrderError(`${listing.buyerPrompt} is required.`, 400);
  if (note.length > BUYER_NOTE_MAX) throw new OrderError(`Keep that under ${BUYER_NOTE_MAX} characters.`, 400);

  // Orders for one listing queue here, not on the database row lock (see keyedLock).
  return withKeyedLock(`listing:${listing.id}`, () => prisma.$transaction(async (tx) => {
    // The buyer's own row first, the shared listing row last: the listing lock is then held
    // for the stock update and the commit only, not for every write of the order. This is
    // also the user-then-listing order cancelOrder uses, so the two can't deadlock.
    // One conditional UPDATE, not read-then-write: same guard as every wallet spend.
    const debited = await tx.user.updateMany({
      where: { id: buyer.id, walletBalance: { gte: listing.priceKobo } },
      data: { walletBalance: { decrement: listing.priceKobo } },
    });
    if (debited.count === 0) throw new OrderError("Your wallet balance is too low. Top up and try again.", 402);

    await tx.walletTransaction.create({ data: { userId: buyer.id, type: "MARKETPLACE_DEBIT", amount: listing.priceKobo, status: "COMPLETE" } });
    const order = await tx.order.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        listingTitle: listing.title,
        category: listing.category,
        amountKobo: listing.priceKobo,
        buyerNote: note || null,
        // A listing with a download link is delivered the moment it is paid.
        ...(listing.deliveryUrl ? { status: "FULFILLED" as const, fulfilledAt: new Date(), fulfilmentNote: "Your download is ready." } : {}),
      },
    });
    if (listing.stock !== null) {
      const taken = await tx.listing.updateMany({ where: { id: listing.id, status: "ACTIVE", stock: { gt: 0 } }, data: { stock: { decrement: 1 } } });
      if (taken.count === 0) throw new OrderError("Sold out.", 409); // rolls the debit and order back
      // The last unit just went: close the listing.
      if (listing.stock === 1) await tx.listing.update({ where: { id: listing.id }, data: { status: "SOLD" } });
    }
    return order;
  }), options.signal);
}

/** Mark a paid order delivered. Returns the order, or null if it wasn't PAID. */
export async function fulfilOrder(orderId: string, note: string | null) {
  const done = await prisma.order.updateMany({
    where: { id: orderId, status: "PAID" },
    data: { status: "FULFILLED", fulfilmentNote: note, fulfilledAt: new Date() },
  });
  return done.count === 0 ? null : prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}

/**
 * Cancel an order and put the money back in the buyer's wallet. Returns null if it
 * wasn't in a state that allows it. A PAID order (not yet delivered) always can;
 * `refundDelivered` also lets staff refund one already marked delivered (a wrong
 * file, a bad code). That one stops the buyer's download, and a delivered item is
 * not put back in stock.
 */
export async function cancelOrder(orderId: string, reason: string | null, options: { refundDelivered?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: { in: options.refundDelivered ? ["PAID", "FULFILLED"] : ["PAID"] } },
      data: { status: "CANCELLED", fulfilmentNote: reason, cancelledAt: new Date() },
    });
    if (claimed.count === 0) return null;
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    await tx.user.update({ where: { id: order.buyerId }, data: { walletBalance: { increment: order.amountKobo } } });
    await tx.walletTransaction.create({ data: { userId: order.buyerId, type: "MARKETPLACE_REFUND", amount: order.amountKobo, status: "COMPLETE" } });
    // Give the unit back; a listing that sold out because of it opens again.
    const listing = await tx.listing.findUnique({ where: { id: order.listingId }, select: { stock: true, status: true } });
    if (before?.status === "PAID" && listing && listing.stock !== null) {
      await tx.listing.update({
        where: { id: order.listingId },
        data: { stock: { increment: 1 }, ...(listing.stock === 0 && listing.status === "SOLD" ? { status: "ACTIVE" } : {}) },
      });
    }
    return order;
  });
}
