import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { flutterwaveClient } from "@/lib/payments/flutterwave";
import { cleanupAll, createTestUser, uniqueSuffix } from "@/testHelpers";
import { POST } from "./route";

/**
 * The Flutterwave webhook (finding #20).
 *
 * Before this, the route handled `charge.completed` and nothing else, so a withdrawal or prize payout had no
 * prompt settlement path at all: it waited on the sweep's 30-minute reconciliation, and on a deployment where
 * that backstop kept failing, on nothing. The tests below are about the half that was missing — a transfer
 * event — and about the rule that makes it safe to act on one: the payload says which transfer to ask about,
 * and Flutterwave is the one that answers.
 *
 * The confirmers and the observability sink are stubbed, because neither is what this file is testing and
 * both would otherwise reach out (a provider call, a console error) from a unit that is about routing.
 */

vi.mock("@/lib/payments/confirm", () => ({ confirmEntryFeePayment: vi.fn(async () => undefined), confirmWalletFunding: vi.fn(async () => undefined) }));
vi.mock("@/lib/marketplaceCheckout", () => ({ confirmMarketplacePayment: vi.fn(async () => undefined) }));
vi.mock("@/lib/observability", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

const { confirmEntryFeePayment } = await import("@/lib/payments/confirm");
const { captureException } = await import("@/lib/observability");

const HASH = "flw-test-hash";

function webhook(event: unknown, hash: string | null = HASH) {
  return POST(
    new Request("http://localhost/api/webhooks/flutterwave", {
      method: "POST",
      headers: { "content-type": "application/json", ...(hash ? { "verif-hash": hash } : {}) },
      body: JSON.stringify(event),
    })
  );
}

/** A withdrawal sitting at the provider, exactly as the withdraw route leaves it. */
async function pendingWithdrawal(amount = 50_000) {
  const user = await createTestUser({ walletBalance: 0 });
  const reference = `test-flw-withdraw-${uniqueSuffix()}`;
  await prisma.walletTransaction.create({
    data: { userId: user.id, type: "WITHDRAWAL", amount, provider: "FLUTTERWAVE", providerRef: reference, status: "PENDING" },
  });
  return { user, reference };
}

const withdrawalRow = (ref: string) => prisma.walletTransaction.findUniqueOrThrow({ where: { providerRef: ref } });

let savedHash: string | undefined;

beforeEach(() => {
  savedHash = process.env.FLUTTERWAVE_SECRET_HASH;
  process.env.FLUTTERWAVE_SECRET_HASH = HASH;
});

afterEach(async () => {
  if (savedHash === undefined) delete process.env.FLUTTERWAVE_SECRET_HASH;
  else process.env.FLUTTERWAVE_SECRET_HASH = savedHash;
  vi.restoreAllMocks();
  await cleanupAll();
});

describe("flutterwave webhook signature", () => {
  it("refuses a request that did not come from Flutterwave, and touches nothing", async () => {
    const { reference } = await pendingWithdrawal();

    const res = await webhook({ event: "transfer.completed", data: { reference, status: "SUCCESSFUL" } }, "not-the-hash");

    expect(res.status).toBe(401);
    expect((await withdrawalRow(reference)).status).toBe("PENDING");
  });

  it("refuses everything when no hash is configured, rather than trusting the header", async () => {
    // The deployment this file mostly describes — Paystack is the live provider and Flutterwave is legacy, so
    // the hash is unset. The route must be inert there, not open.
    delete process.env.FLUTTERWAVE_SECRET_HASH;
    const { reference } = await pendingWithdrawal();

    const res = await webhook({ event: "transfer.completed", data: { reference, status: "SUCCESSFUL" } });

    expect(res.status).toBe(401);
    expect((await withdrawalRow(reference)).status).toBe("PENDING");
  });
});

describe("flutterwave transfer webhook (finding #20)", () => {
  it("settles a successful withdrawal, from the transfer's own reference field", async () => {
    const { reference } = await pendingWithdrawal();
    const verify = vi.spyOn(flutterwaveClient, "verifyTransfer").mockResolvedValue("SUCCESS");

    const res = await webhook({ event: "transfer.completed", data: { reference, status: "SUCCESSFUL" } });

    expect(res.status).toBe(200);
    // The assertion that pins the actual bug: a transfer payload carries no `tx_ref`, so reading the charge
    // field would have looked up `undefined` and settled nothing at all.
    expect(verify).toHaveBeenCalledWith(reference);
    expect((await withdrawalRow(reference)).status).toBe("COMPLETE");
  });

  it("returns the money when the transfer failed", async () => {
    const { user, reference } = await pendingWithdrawal(50_000);
    vi.spyOn(flutterwaveClient, "verifyTransfer").mockResolvedValue("FAILED");

    await webhook({ event: "transfer.completed", data: { reference, status: "FAILED" } });

    expect((await withdrawalRow(reference)).status).toBe("FAILED");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).walletBalance).toBe(50_000);
  });

  it("re-verifies rather than believing the payload", async () => {
    // The whole reason a transfer event is safe to act on. A payload claiming success while Flutterwave still
    // says PENDING must leave the row alone — the webhook tells us which transfer to ask about, not the answer.
    const { reference } = await pendingWithdrawal();
    vi.spyOn(flutterwaveClient, "verifyTransfer").mockResolvedValue("PENDING");

    await webhook({ event: "transfer.completed", data: { reference, status: "SUCCESSFUL" } });

    expect((await withdrawalRow(reference)).status).toBe("PENDING");
  });

  it("fails loudly so Flutterwave retries, and the retry is safe", async () => {
    const { user, reference } = await pendingWithdrawal(50_000);
    vi.spyOn(flutterwaveClient, "verifyTransfer").mockRejectedValue(new Error("flutterwave is down"));

    await expect(webhook({ event: "transfer.completed", data: { reference, status: "SUCCESSFUL" } })).rejects.toThrow("flutterwave is down");

    expect(captureException).toHaveBeenCalled();
    expect((await withdrawalRow(reference)).status).toBe("PENDING");

    // The retry that Flutterwave's 5xx earns it: the same event, this time answered. Every handler here is a
    // compare-and-swap, so applying it once is all that can happen.
    vi.spyOn(flutterwaveClient, "verifyTransfer").mockResolvedValue("SUCCESS");
    await webhook({ event: "transfer.completed", data: { reference, status: "SUCCESSFUL" } });

    expect((await withdrawalRow(reference)).status).toBe("COMPLETE");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).walletBalance).toBe(0);
  });

  it("is a no-op for a transfer reference no row carries", async () => {
    vi.spyOn(flutterwaveClient, "verifyTransfer").mockResolvedValue("SUCCESS");

    const res = await webhook({ event: "transfer.completed", data: { reference: `test-flw-unknown-${uniqueSuffix()}` } });

    expect(res.status).toBe(200);
  });
});

describe("flutterwave charge webhook", () => {
  it("still confirms a charge, unchanged", async () => {
    const reference = `test-flw-charge-${uniqueSuffix()}`;

    const res = await webhook({ event: "charge.completed", data: { tx_ref: reference, status: "successful" } });

    expect(res.status).toBe(200);
    expect(confirmEntryFeePayment).toHaveBeenCalledWith(reference);
  });

  it("acknowledges and ignores anything else", async () => {
    const res = await webhook({ event: "subscription.cancelled", data: {} });

    expect(res.status).toBe(200);
    expect(confirmEntryFeePayment).not.toHaveBeenCalled();
  });

  it("answers a malformed body cleanly instead of 500-ing", async () => {
    const res = await POST(
      new Request("http://localhost/api/webhooks/flutterwave", {
        method: "POST",
        headers: { "content-type": "application/json", "verif-hash": HASH },
        body: "{not json",
      })
    );

    expect(res.status).toBe(200);
    expect(captureException).toHaveBeenCalled();
  });
});
