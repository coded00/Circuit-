import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderRequestError, isDefiniteRejection } from "./errors";
import { paystackClient } from "./paystack";

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
