import { afterEach, describe, expect, it, vi } from "vitest";
import { flutterwaveClient, mapFlutterwaveChargeStatus } from "./flutterwave";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Flutterwave answers every call with `{ status: "success", data: ... }`; flutterwaveFetch unwraps `data`. */
function reply(data: unknown, status = 200) {
  vi.stubEnv("FLUTTERWAVE_SECRET_KEY", "FLWSECK-test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ status: "success", data }), { status }))
  );
}

/**
 * A settling Flutterwave charge must not be reported as FAILED.
 *
 * FAILED is terminal everywhere it lands: the row is flipped and never looked at again — not by the webhook
 * replay, not by the redirect callback, not by reconcilePendingMoney, which only revisits PENDING rows. So a
 * settling charge reported as FAILED could complete afterwards and leave Circuit holding the customer's money,
 * with the wallet never credited and no refund. The only safe direction to be wrong in is PENDING.
 *
 * This is the same bug that was fixed for Paystack (mapPaystackChargeStatus); the Flutterwave client carried
 * its own inline copy of the ternary, so fixing one provider left the other one wrong.
 */
describe("mapFlutterwaveChargeStatus", () => {
  it("treats a settling charge as still in flight, not failed", () => {
    // Only "failed" is terminal. Every other word — a settling state, or one Flutterwave adds after this
    // code was written — has to stay PENDING, because the cost of the two mistakes is not symmetric.
    for (const status of ["pending", "processing", "some_new_flutterwave_state"]) {
      expect(mapFlutterwaveChargeStatus(status)).toBe("PENDING");
    }
  });

  it("only calls a charge FAILED when Flutterwave says it will not succeed", () => {
    expect(mapFlutterwaveChargeStatus("failed")).toBe("FAILED");
    expect(mapFlutterwaveChargeStatus("successful")).toBe("SUCCESS");
    // Accepted defensively, not because a charge is documented to use it: the refund endpoint reports
    // "completed", so a charge that did the same would otherwise have been refunded as if it had failed.
    expect(mapFlutterwaveChargeStatus("completed")).toBe("SUCCESS");
  });
});

describe("flutterwaveClient.verifyCharge", () => {
  it("reports a settling charge as PENDING through the client", async () => {
    reply({ status: "processing", amount: 1500, currency: "NGN", tx_ref: "ref-1", created_at: "2026-01-01T00:00:00.000Z" });
    const result = await flutterwaveClient.verifyCharge("ref-1");
    expect(result.status).toBe("PENDING");
    // Flutterwave quotes major units; ours are minor (kobo).
    expect(result.amount).toBe(150_000);
  });

  it("still reports success and failure, so the mapping is a decision and not just always-PENDING", async () => {
    reply({ status: "successful", amount: 1500, currency: "NGN", tx_ref: "ref-2", created_at: "2026-01-01T00:00:00.000Z" });
    expect((await flutterwaveClient.verifyCharge("ref-2")).status).toBe("SUCCESS");

    reply({ status: "failed", amount: 1500, currency: "NGN", tx_ref: "ref-3", created_at: null });
    expect((await flutterwaveClient.verifyCharge("ref-3")).status).toBe("FAILED");
  });
});
