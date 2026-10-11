/**
 * Finding #17: withdrawal had no throttle, so the only bound on the number of provider transfers one
 * account could start was its own balance.
 *
 * These tests pin the two things that bound does not cover, because they are the reason the finding is
 * worth fixing rather than noting. A withdrawal the provider reports FAILED is credited straight back to
 * the wallet — so the user can go again at once, and each attempt is another real transfer the platform
 * pays for. And a request refused for an account-state reason (no payout method linked, an unverified
 * email, a balance that hasn't settled) costs nothing and will be refused identically next time, so it
 * must not spend the user's hour.
 *
 * That second one is what pins *where* the check sits, not just that it exists: moved to the top of the
 * handler it would still pass a test about the cap, and would start charging people for requests that
 * never reached the provider.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupAll, createTestUser } from "@/testHelpers";

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
// Both are reachable from the transfer-outcome path (@/lib/payments/transfers), and both would reach the
// network on a deploy that has the keys set. Nothing here is about either of them.
vi.mock("@/lib/notifications", () => ({ notify: vi.fn(async () => undefined) }));
vi.mock("@/lib/observability", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@/lib/payments", () => ({ getPayoutProvider: vi.fn(), getPaymentProvider: vi.fn() }));

const { POST } = await import("./route");
const { getCurrentUser } = await import("@/lib/session");
const { getPayoutProvider } = await import("@/lib/payments");

const initiateTransfer = vi.fn();
const availableBalance = vi.fn();

const AMOUNT = 50_000; // ₦500 — over the ₦100 minimum, so the amount check is never what refuses.
const STARTING_BALANCE = 1_000_000;

beforeEach(() => {
  vi.restoreAllMocks();
  // The email gate turns itself on when an email provider is configured, which would 403 every request
  // here before it reached anything these tests are about.
  delete process.env.RESEND_API_KEY;
  delete process.env.REQUIRE_VERIFIED_EMAIL;

  initiateTransfer.mockResolvedValue({ status: "SUCCESS", providerReference: "ps_ref" });
  // null = "couldn't read the balance", which hasSettledFunds treats as go-ahead.
  availableBalance.mockResolvedValue(null);

  vi.mocked(getPayoutProvider).mockReturnValue({
    name: "PAYSTACK",
    initializeCharge: vi.fn(),
    verifyCharge: vi.fn(),
    initiateTransfer,
    refundCharge: vi.fn(),
    verifyTransfer: vi.fn(),
    availableBalance,
  } as never);
});

afterEach(async () => {
  await cleanupAll();
});

/** A user who is past every gate the route checks before the money moves. */
async function signedInUser(overrides: Parameters<typeof createTestUser>[0] = {}) {
  const user = await createTestUser({
    dateOfBirth: new Date("1995-06-15"),
    payoutMethodRef: "acct_test_withdraw",
    walletBalance: STARTING_BALANCE,
    ...overrides,
  });
  asUser(user);
  return user;
}

/** The route reads the whole User row through getCurrentUser, so a test that changes one has to hand
 *  the fresh row over rather than relying on the fixture object it captured earlier. */
function asUser(user: { id: string }) {
  vi.mocked(getCurrentUser).mockResolvedValue(user as never);
}

function post() {
  return POST(
    new Request("http://localhost/api/wallet/withdraw", { method: "POST", body: JSON.stringify({ amount: AMOUNT }) })
  );
}

describe("the money-out throttle (#17)", () => {
  it("lets five withdrawals through in an hour and refuses the sixth", async () => {
    const user = await signedInUser();

    for (let i = 0; i < 5; i++) expect((await post()).status).toBe(200);

    const blocked = await post();

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    // The refusal is worth nothing if the transfer went out anyway.
    expect(initiateTransfer).toHaveBeenCalledTimes(5);
    expect(await prisma.walletTransaction.count({ where: { userId: user.id } })).toBe(5);
  });

  it("counts a withdrawal the provider reports FAILED — the case the balance does not bound", async () => {
    // Each attempt debits the wallet, the provider reports FAILED, and applyTransferOutcome credits the
    // money straight back. So the balance is whole again after every one of these and would let the user
    // go again forever; what stops it is this counter, and every one of them was a real provider call.
    const user = await signedInUser();
    initiateTransfer.mockResolvedValue({ status: "FAILED", providerReference: "ps_ref" });

    for (let i = 0; i < 5; i++) expect((await post()).status).toBe(502);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).walletBalance).toBe(STARTING_BALANCE);

    expect((await post()).status).toBe(429);
    expect(initiateTransfer).toHaveBeenCalledTimes(5);
  });

  it("does not spend the hour on requests that never reached the provider", async () => {
    // Six refusals for a reason that will not change on its own, then the user links a payout method.
    // The check sits after the account-state gates precisely so this user still has a full hour left.
    const user = await signedInUser({ payoutMethodRef: null });

    for (let i = 0; i < 6; i++) expect((await post()).status).toBe(400);

    asUser(await prisma.user.update({ where: { id: user.id }, data: { payoutMethodRef: "acct_test_withdraw" } }));

    expect((await post()).status).toBe(200);
    expect(initiateTransfer).toHaveBeenCalledTimes(1);
  });

  it("keeps one account's hour out of another's", async () => {
    await signedInUser();
    for (let i = 0; i < 5; i++) await post();
    expect((await post()).status).toBe(429);

    await signedInUser();

    expect((await post()).status).toBe(200);
  });

  it("still refuses a signed-out caller before any of this", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    expect((await post()).status).toBe(401);
    expect(initiateTransfer).not.toHaveBeenCalled();
  });
});
