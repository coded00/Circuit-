/**
 * Circuit — refunding a Marketplace order that was paid by card. The money goes back to the card through the
 * payment provider (a wallet order's refund goes back into the wallet instead, see cancelOrder). The refund's
 * progress is kept on the order: PENDING while the provider processes it, COMPLETE once it has, FAILED if the
 * provider refused or could not be reached, which needs a person (staff can retry it from the orders page).
 */
import { prisma } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";
import { captureException } from "@/lib/observability";
import { notifyStaff } from "@/lib/notifications";

export async function refundCardOrder(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.paymentMethod !== "CARD" || !order.paymentRef || !order.paymentProvider) return order;
  if (order.refundStatus === "COMPLETE") return order;
  try {
    const result = await getPaymentProvider(order.paymentProvider).refundCharge(order.paymentRef, order.amountKobo);
    return prisma.order.update({ where: { id: orderId }, data: { refundStatus: result.status === "SUCCESS" ? "COMPLETE" : "PENDING" } });
  } catch (err) {
    captureException(err, { source: "marketplace:cardRefund", orderId, amount: order.amountKobo });
    // A person has to look at this: tell staff now, and it also shows on the admin Overview.
    await notifyStaff("CARD_REFUND_FAILED", { orderId, title: order.listingTitle, amount: order.amountKobo }).catch(() => undefined);
    return prisma.order.update({ where: { id: orderId }, data: { refundStatus: "FAILED" } });
  }
}

/** Staff retry of a card refund that failed. Only a FAILED refund is retried; nothing else is touched. */
export async function retryCardRefund(orderId: string) {
  const claimed = await prisma.order.updateMany({ where: { id: orderId, paymentMethod: "CARD", status: "CANCELLED", refundStatus: "FAILED" }, data: { refundStatus: "PENDING" } });
  if (claimed.count === 0) return null;
  return refundCardOrder(orderId);
}

/** The provider's refund webhook, matched by the original charge's reference. Safe to call for a reference that isn't ours. */
export async function applyMarketplaceRefundOutcome(chargeRef: string, outcome: "SUCCESS" | "FAILED"): Promise<"APPLIED" | "NO_CHANGE" | "UNKNOWN"> {
  const order = await prisma.order.findUnique({ where: { paymentRef: chargeRef }, select: { id: true } });
  if (!order) return "UNKNOWN";
  const done = await prisma.order.updateMany({ where: { id: order.id, refundStatus: "PENDING" }, data: { refundStatus: outcome === "SUCCESS" ? "COMPLETE" : "FAILED" } });
  return done.count > 0 ? "APPLIED" : "NO_CHANGE";
}
