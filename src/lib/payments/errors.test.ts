import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderRequestError, isDefiniteRejection } from "./errors";
import { mapPaystackChargeStatus, paystackClient } from "./paystack";

afterEach(() => vi.unstubAllGlobals());

describe("isDefiniteRejection", () => {
  it("is true only when the provider answered with a 4xx", () => {
    expect(isDefiniteRejection(new ProviderRequestError("Insufficient balance", 400))).toBe(true);
    expect(isDefiniteRejection(new ProviderRequestError("Not found", 404))).toBe(true);
    expect(isDefiniteRejection(new ProviderRequestError("Bad gateway", 502))).toBe(false);
    expect(isDefiniteRejection(new Error("fetch failed"))).toBe(false);
    expect(isDefiniteRejection(Object.assign(new Error("timeout"), { name: "TimeoutError" }))).toBe(false);
  });
});

describe("paystackClient.verifyTransfer", () => {
  const reply = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

  it("reports a transfer Paystack has no record of as FAILED, so the money can go back", async () => {
    reply(404, { status: false, message: "Transfer not found" });
    expect(await paystackClient.verifyTransfer("never-sent")).toBe("FAILED");
  });
  it("still reports real outcomes, and lets other errors surface instead of guessing", async () => {
    reply(200, { status: true, data: { status: "success" } });
    expect(await paystackClient.verifyTransfer("ok")).toBe("SUCCESS");
    reply(500, { status: false, message: "Server error" });
    await expect(paystackClient.verifyTransfer("unknown")).rejects.toBeInstanceOf(ProviderRequestError);
  });
});

/**
 * A charge that is still settling must not be reported as FAILED.
 *
 * FAILED is terminal everywhere it lands: the row is flipped and never looked at again — not by the webhook
 * replay, not by the redirect callback, not by reconcilePendingMoney, which only revisits PENDING rows. So a
 * settling charge reported as FAILED could complete afterwards and leave Circuit holding the customer's
 * money, with the wallet never credited and no refund. The only safe direction to be wrong in is PENDING.
 */
describe("paystackClient.verifyCharge status mapping", () => {
  it("treats Paystack's settling states as still in flight, not failed", () => {
    // Every one of these is a real /transaction/verify value for a charge that hasn't finished.
    for (const status of ["abandoned", "ongoing", "pending", "processing", "queued"]) {
      expect(mapPaystackChargeStatus(status)).toBe("PENDING");
    }
  });

  it("only calls a charge FAILED when Paystack says it will not succeed", () => {
    expect(mapPaystackChargeStatus("failed")).toBe("FAILED");
    expect(mapPaystackChargeStatus("reversed")).toBe("FAILED"); // refunded/reversed: it will never fund a wallet
    expect(mapPaystackChargeStatus("success")).toBe("SUCCESS");
    // A status this code has never heard of is in flight by default, never failed — see the note above on
    // which way round the mistake has to fall.
    expect(mapPaystackChargeStatus("some_new_paystack_state")).toBe("PENDING");
  });

  it("returns PENDING through the client for a settling charge", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: true, data: { status: "processing", amount: 100_000, currency: "NGN", reference: "ref-1", paid_at: null } }), { status: 200 })));
    const result = await paystackClient.verifyCharge("ref-1");
    expect(result.status).toBe("PENDING");
    expect(result.amount).toBe(100_000);
  });
});
