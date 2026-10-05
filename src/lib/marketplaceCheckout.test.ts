import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupAll, createTestStaff, createTestUser } from "@/testHelpers";
import { paystackClient } from "@/lib/payments/paystack";
import { OrderError, cancelOrder } from "@/lib/marketplaceOrders";
import { applyMarketplaceRefundOutcome, retryCardRefund } from "@/lib/marketplaceCardRefund";
import { confirmMarketplacePayment, expireUnpaidOrders, startCardCheckout } from "@/lib/marketplaceCheckout";

const PRICE = 500_000;

async function setup(listingOver: Record<string, unknown> = {}) {
  const seller = await createTestStaff();
  const buyer = await createTestUser({ walletBalance: 1_000_000 });
  const listing = await prisma.listing.create({ data: { sellerId: seller.id, category: "STORE", title: "TEST-Card tee", description: "A test product.", priceKobo: PRICE, stock: 5, ...listingOver } });
  return { seller, buyer, listing };
}
const stockOf = async (id: string) => prisma.listing.findUniqueOrThrow({ where: { id }, select: { stock: true, status: true } });
const mockCharge = (status: "SUCCESS" | "FAILED" | "PENDING", amount = PRICE) =>
  vi.spyOn(paystackClient, "verifyCharge").mockResolvedValue({ status, amount, currency: "NGN", providerReference: "x", paidAt: new Date() });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.spyOn(paystackClient, "initializeCharge").mockResolvedValue({ authorizationUrl: "https://checkout.test/pay", providerReference: "x" });
  vi.spyOn(paystackClient, "refundCharge").mockResolvedValue({ status: "SUCCESS", providerReference: "x" });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await cleanupAll();
});

describe("starting a card checkout", () => {
  it("holds a unit and opens the provider's checkout, without touching the wallet", async () => {
    const { buyer, listing } = await setup();
    const { orderId, authorizationUrl } = await startCardCheckout(buyer, { listingId: listing.id });
    expect(authorizationUrl).toBe("https://checkout.test/pay");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order).toMatchObject({ status: "PENDING_PAYMENT", paymentMethod: "CARD", amountKobo: PRICE });
    expect(order.paymentRef).toMatch(/^mkt_/);
    expect(order.reservedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect((await stockOf(listing.id)).stock).toBe(4);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).walletBalance).toBe(1_000_000);
    expect(await prisma.walletTransaction.count({ where: { userId: buyer.id } })).toBe(0);
  });

  it("closes the listing while its last unit is held, and sells it to only one of several buyers", async () => {
    const { listing } = await setup({ stock: 1 });
    const buyers = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
    const results = await Promise.allSettled(buyers.map((b) => startCardCheckout(b, { listingId: listing.id })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof OrderError)).toBe(true);
    expect(await stockOf(listing.id)).toEqual({ stock: 0, status: "SOLD" });
    expect(await prisma.order.count({ where: { listingId: listing.id } })).toBe(1);
  });

  it("limits how many units one buyer can hold at once", async () => {
    const { buyer, listing } = await setup();
    await startCardCheckout(buyer, { listingId: listing.id });
    await startCardCheckout(buyer, { listingId: listing.id });
    await expect(startCardCheckout(buyer, { listingId: listing.id })).rejects.toMatchObject({ status: 409 });
    expect((await stockOf(listing.id)).stock).toBe(3);
  });

  it("gives the unit back if the provider can't open the checkout", async () => {
    vi.spyOn(paystackClient, "initializeCharge").mockRejectedValue(new Error("provider down"));
    const { buyer, listing } = await setup({ stock: 1 });
    await expect(startCardCheckout(buyer, { listingId: listing.id })).rejects.toMatchObject({ status: 502 });
    expect(await stockOf(listing.id)).toEqual({ stock: 1, status: "ACTIVE" });
    expect((await prisma.order.findFirstOrThrow({ where: { listingId: listing.id } })).status).toBe("CANCELLED");
  });
});

describe("confirming a card payment", () => {
  it("marks the order paid once, however many times the webhook and the return page both arrive", async () => {
    const { buyer, listing } = await setup();
    const { orderId } = await startCardCheckout(buyer, { listingId: listing.id });
    const ref = (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentRef!;
    mockCharge("SUCCESS");
    const outcomes = await Promise.all([confirmMarketplacePayment(ref), confirmMarketplacePayment(ref), confirmMarketplacePayment(ref)]);
    expect(outcomes.filter((o) => o === "CONFIRMED")).toHaveLength(1);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("PAID");
    expect(order.reservedUntil).toBeNull();
    expect((await stockOf(listing.id)).stock).toBe(4); // still just the one unit
    expect(paystackClient.refundCharge).not.toHaveBeenCalled();
  });

  it("delivers an instant-download listing as soon as it is paid", async () => {
    const { buyer, listing } = await setup({ deliveryUrl: "https://example.com/file.zip" });
    const { orderId } = await startCardCheckout(buyer, { listingId: listing.id });
    mockCharge("SUCCESS");
    await confirmMarketplacePayment((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentRef!);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ status: "FULFILLED", fulfilmentNote: "Your download is ready." });
  });

  it("does nothing while the payment is still pending", async () => {
    const { buyer, listing } = await setup();
    const { orderId } = await startCardCheckout(buyer, { listingId: listing.id });
    mockCharge("PENDING");
    expect(await confirmMarketplacePayment((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentRef!)).toBe("STILL_PENDING");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PENDING_PAYMENT");
  });

  it("releases the unit when the payment fails", async () => {
    const { buyer, listing } = await setup({ stock: 1 });
    const { orderId } = await startCardCheckout(buyer, { listingId: listing.id });
    mockCharge("FAILED");
    expect(await confirmMarketplacePayment((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentRef!)).toBe("FAILED");
    expect(await stockOf(listing.id)).toEqual({ stock: 1, status: "ACTIVE" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("CANCELLED");
  });

  it("refunds a payment of the wrong amount instead of accepting it", async () => {
    const { buyer, listing } = await setup();
    const { orderId } = await startCardCheckout(buyer, { listingId: listing.id });
    const ref = (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentRef!;
    mockCharge("SUCCESS", PRICE - 1);
    expect(await confirmMarketplacePayment(ref)).toBe("REFUNDED");
    expect(paystackClient.refundCharge).toHaveBeenCalledWith(ref, PRICE - 1);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ status: "CANCELLED", refundStatus: "COMPLETE" });
    expect((await stockOf(listing.id)).stock).toBe(5);
  });

  it("refunds, exactly once, a payment that arrives after the hold ran out", async () => {
    const { buyer, listing } = await setup();
    const { orderId } = await startCardCheckout(buyer, { listingId: listing.id });
    const ref = (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentRef!;
    await prisma.order.update({ where: { id: orderId }, data: { reservedUntil: new Date(Date.now() - 60_000) } });
    mockCharge("PENDING");
    await expireUnpaidOrders(); // nothing paid yet: the unit is released
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("CANCELLED");

    mockCharge("SUCCESS"); // ...and then the buyer's payment lands anyway
    await Promise.all([confirmMarketplacePayment(ref), confirmMarketplacePayment(ref)]);
    expect(paystackClient.refundCharge).toHaveBeenCalledTimes(1);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ status: "CANCELLED", refundStatus: "COMPLETE" });
  });

  it("keeps the claim open for a retry if the refund call itself fails", async () => {
    const { buyer, listing } = await setup();
    const { orderId } = await startCardCheckout(buyer, { listingId: listing.id });
    const ref = (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentRef!;
    await prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED", reservedUntil: null } });
    mockCharge("SUCCESS");
    vi.spyOn(paystackClient, "refundCharge").mockRejectedValueOnce(new Error("provider down"));
    await expect(confirmMarketplacePayment(ref)).rejects.toThrow("provider down");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).refundRef).toBeNull();
    expect(await confirmMarketplacePayment(ref)).toBe("REFUNDED"); // the provider's next delivery succeeds
  });
});

describe("expiring unpaid orders", () => {
  it("releases overdue holds and leaves current ones alone", async () => {
    const { buyer, listing } = await setup({ stock: 2 });
    const overdue = await startCardCheckout(buyer, { listingId: listing.id });
    const current = await startCardCheckout(buyer, { listingId: listing.id });
    await prisma.order.update({ where: { id: overdue.orderId }, data: { reservedUntil: new Date(Date.now() - 60_000) } });
    mockCharge("PENDING");
    const result = await expireUnpaidOrders();
    expect(result.released).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: overdue.orderId } })).status).toBe("CANCELLED");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: current.orderId } })).status).toBe("PENDING_PAYMENT");
    expect((await stockOf(listing.id)).stock).toBe(1);
  });

  it("confirms, not releases, an overdue hold whose payment actually went through", async () => {
    const { buyer, listing } = await setup();
    const { orderId } = await startCardCheckout(buyer, { listingId: listing.id });
    await prisma.order.update({ where: { id: orderId }, data: { reservedUntil: new Date(Date.now() - 60_000) } });
    mockCharge("SUCCESS");
    const result = await expireUnpaidOrders();
    expect(result).toMatchObject({ released: 0, confirmed: 1 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PAID");
  });
});

describe("cancelling a card order", () => {
  async function paidCardOrder(listingOver: Record<string, unknown> = {}) {
    const ctx = await setup(listingOver);
    const { orderId } = await startCardCheckout(ctx.buyer, { listingId: ctx.listing.id });
    mockCharge("SUCCESS");
    await confirmMarketplacePayment((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentRef!);
    return { ...ctx, orderId };
  }

  it("refunds the card, not the wallet, and puts the unit back", async () => {
    const { buyer, listing, orderId } = await paidCardOrder({ stock: 1 });
    expect(await stockOf(listing.id)).toEqual({ stock: 0, status: "SOLD" });
    const order = await cancelOrder(orderId, "Out of stock");
    expect(order).toMatchObject({ status: "CANCELLED", refundStatus: "COMPLETE" });
    expect(paystackClient.refundCharge).toHaveBeenCalledWith(order!.paymentRef, PRICE);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).walletBalance).toBe(1_000_000); // untouched
    expect(await prisma.walletTransaction.count({ where: { userId: buyer.id } })).toBe(0);
    expect(await stockOf(listing.id)).toEqual({ stock: 1, status: "ACTIVE" });
  });

  it("records a failed refund and lets staff retry it", async () => {
    const { orderId } = await paidCardOrder();
    vi.spyOn(paystackClient, "refundCharge").mockRejectedValueOnce(new Error("provider down"));
    expect((await cancelOrder(orderId, null))!.refundStatus).toBe("FAILED");
    expect((await retryCardRefund(orderId))!.refundStatus).toBe("COMPLETE");
    expect(await retryCardRefund(orderId)).toBeNull(); // nothing left to retry
  });

  it("settles a pending refund from the provider's webhook", async () => {
    const { orderId } = await paidCardOrder();
    vi.spyOn(paystackClient, "refundCharge").mockResolvedValueOnce({ status: "PENDING", providerReference: "x" });
    const order = (await cancelOrder(orderId, null))!;
    expect(order.refundStatus).toBe("PENDING");
    expect(await applyMarketplaceRefundOutcome(order.paymentRef!, "SUCCESS")).toBe("APPLIED");
    expect(await applyMarketplaceRefundOutcome(order.paymentRef!, "SUCCESS")).toBe("NO_CHANGE");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).refundStatus).toBe("COMPLETE");
    expect(await applyMarketplaceRefundOutcome("not-ours", "SUCCESS")).toBe("UNKNOWN");
  });
});
