import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupAll, createTestStaff, createTestUser } from "@/testHelpers";
import { OrderError, cancelOrder, fulfilOrder, placeOrder } from "@/lib/marketplaceOrders";

const listingFor = (sellerId: string, over: Record<string, unknown> = {}) =>
  prisma.listing.create({ data: { sellerId, category: "STORE", title: "TEST-Circuit tee", description: "A test product for orders.", priceKobo: 500_000, ...over } });
const wallet = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).walletBalance;

describe("marketplace orders", () => {
  beforeEach(cleanupAll);
  afterAll(cleanupAll);

  it("takes the price from the wallet, records the purchase and decrements stock", async () => {
    const seller = await createTestStaff();
    const buyer = await createTestUser({ walletBalance: 1_000_000 });
    const listing = await listingFor(seller.id, { stock: 3 });

    const order = await placeOrder(buyer, { listingId: listing.id });

    expect(order).toMatchObject({ status: "PAID", amountKobo: 500_000, listingTitle: "TEST-Circuit tee" });
    expect(await wallet(buyer.id)).toBe(500_000);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).stock).toBe(2);
    expect(await prisma.walletTransaction.count({ where: { userId: buyer.id, type: "MARKETPLACE_DEBIT", amount: 500_000 } })).toBe(1);
  });

  it("refuses when the wallet is short, leaving stock and balance alone", async () => {
    const seller = await createTestStaff();
    const buyer = await createTestUser({ walletBalance: 100 });
    const listing = await listingFor(seller.id, { stock: 1 });

    await expect(placeOrder(buyer, { listingId: listing.id })).rejects.toMatchObject({ status: 402 });
    expect(await wallet(buyer.id)).toBe(100);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).stock).toBe(1);
  });

  it("sells the last unit once: the second buyer gets sold out and the listing closes", async () => {
    const seller = await createTestStaff();
    const a = await createTestUser({ walletBalance: 1_000_000 });
    const b = await createTestUser({ walletBalance: 1_000_000 });
    const listing = await listingFor(seller.id, { stock: 1 });

    const results = await Promise.allSettled([placeOrder(a, { listingId: listing.id }), placeOrder(b, { listingId: listing.id })]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("SOLD");
    expect((await wallet(a.id)) + (await wallet(b.id))).toBe(1_500_000);
  });

  it("requires the buyer's details when the listing asks for them, and won't let you buy your own", async () => {
    const seller = await createTestStaff({ walletBalance: 1_000_000 });
    const buyer = await createTestUser({ walletBalance: 1_000_000 });
    const listing = await listingFor(seller.id, { buyerPrompt: "Your in-game name" });

    await expect(placeOrder(buyer, { listingId: listing.id })).rejects.toBeInstanceOf(OrderError);
    await expect(placeOrder(seller, { listingId: listing.id, note: "me" })).rejects.toMatchObject({ status: 400 });
    expect(await placeOrder(buyer, { listingId: listing.id, note: "  Ace  " })).toMatchObject({ buyerNote: "Ace" });
  });

  it("delivers a listing with a download link the moment it is paid", async () => {
    const seller = await createTestStaff();
    const buyer = await createTestUser({ walletBalance: 1_000_000 });
    const listing = await listingFor(seller.id, { category: "DIGITAL", deliveryUrl: "https://files.example.com/book.pdf" });

    const order = await placeOrder(buyer, { listingId: listing.id });

    expect(order).toMatchObject({ status: "FULFILLED", fulfilmentNote: "Your download is ready." });
    expect(order.fulfilledAt).not.toBeNull();
    expect(await wallet(buyer.id)).toBe(500_000);
  });

  it("fulfils once, and a cancel after that does nothing", async () => {
    const seller = await createTestStaff();
    const buyer = await createTestUser({ walletBalance: 1_000_000 });
    const order = await placeOrder(buyer, { listingId: (await listingFor(seller.id)).id });

    expect(await fulfilOrder(order.id, "Code: ABC")).toMatchObject({ status: "FULFILLED", fulfilmentNote: "Code: ABC" });
    expect(await fulfilOrder(order.id, null)).toBeNull();
    expect(await cancelOrder(order.id, "late")).toBeNull();
    expect(await wallet(buyer.id)).toBe(500_000);
  });

  it("cancelling refunds the wallet once, returns the stock and reopens a sold-out listing", async () => {
    const seller = await createTestStaff();
    const buyer = await createTestUser({ walletBalance: 1_000_000 });
    const listing = await listingFor(seller.id, { stock: 1 });
    const order = await placeOrder(buyer, { listingId: listing.id });
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("SOLD");

    const [first, second] = await Promise.all([cancelOrder(order.id, "Out of stock"), cancelOrder(order.id, "Out of stock")]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(await wallet(buyer.id)).toBe(1_000_000);
    expect(await prisma.walletTransaction.count({ where: { userId: buyer.id, type: "MARKETPLACE_REFUND" } })).toBe(1);
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ stock: 1, status: "ACTIVE" });
  });
});
