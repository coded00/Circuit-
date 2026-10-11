/**
 * Finding #17: the prize-payout route had no throttle either.
 *
 * The payout route is the more interesting half of the finding, because the balance argument does not
 * apply to it at all. A successfully claimed prize cannot be claimed twice — the escrow row blocks it —
 * so the repeats this has to bound are the *failures*: a prize payout the provider reports FAILED is
 * marked FAILED rather than left PENDING, which deliberately reopens the claim so the winner can try
 * again. That reopening is right, and it means a payout method the provider keeps refusing is an
 * unbounded loop of real transfers with nothing counting them.
 *
 * Same as the withdrawal route: the account-state gates above the check refuse identically every time,
 * so they must not spend the user's hour. The test for that flips a tournament's payout approval, which
 * is the state a winner is most likely to hit repeatedly ("Prizes are released after Circuit staff
 * review" is a message they will keep coming back to).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupAll, createTestOrganizer, createTestUser, uniqueSuffix } from "@/testHelpers";

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(), suspendedResponse: vi.fn(() => null) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn(async () => undefined) }));
vi.mock("@/lib/observability", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@/lib/payments", () => ({ getDefaultPaymentProvider: vi.fn(), getPaymentProvider: vi.fn() }));

const { POST } = await import("./route");
const { getCurrentUser } = await import("@/lib/session");
const { getDefaultPaymentProvider, getPaymentProvider } = await import("@/lib/payments");
const { captureException } = await import("@/lib/observability");

const initiateTransfer = vi.fn();
const availableBalance = vi.fn();
const verifyTransfer = vi.fn();

const PRIZE = 1_000_000; // ₦10,000, declared on the tournament; the staff organizer means it is paid in full.
const HOURS = 60 * 60 * 1000;

let originalSettlementHours: number | null = null;

beforeEach(async () => {
  vi.restoreAllMocks();
  delete process.env.RESEND_API_KEY;
  delete process.env.REQUIRE_VERIFIED_EMAIL;

  // releaseDelayHours() reads this off the singleton, and it is a shared row other test files write to.
  // Pinned for this file so a tournament that ended two days ago is always past its release window.
  originalSettlementHours =
    (await prisma.platformSetting.findUnique({ where: { id: "singleton" }, select: { organizerRevenueSettlementHours: true } }))
      ?.organizerRevenueSettlementHours ?? null;
  await prisma.platformSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", organizerRevenueSettlementHours: 24 },
    update: { organizerRevenueSettlementHours: 24 },
  });

  initiateTransfer.mockResolvedValue({ status: "SUCCESS", providerReference: "ps_payout" });
  // Asking about an earlier FAILED attempt is the re-verify guard (finding 1a). "FAILED" is the ordinary
  // answer — a transfer the provider really did refuse — and it is the one that leaves the retry loop
  // finding #17 bounds working, which is what most of this file measures.
  verifyTransfer.mockResolvedValue("FAILED");
  availableBalance.mockResolvedValue(null);

  const client = {
    name: "PAYSTACK",
    initializeCharge: vi.fn(),
    verifyCharge: vi.fn(),
    initiateTransfer,
    refundCharge: vi.fn(),
    verifyTransfer,
    availableBalance,
  } as never;
  vi.mocked(getDefaultPaymentProvider).mockReturnValue(client);
  // Both, because the guard asks the *row's* own provider rather than the default — a legacy Flutterwave
  // payout has to be asked of Flutterwave, and the point of the test is that it is a different client.
  vi.mocked(getPaymentProvider).mockReturnValue(client);
});

afterEach(async () => {
  await cleanupAll();
  // Put the shared row back exactly as it was: the value, or no row at all.
  if (originalSettlementHours === null) await prisma.platformSetting.deleteMany({ where: { id: "singleton" } });
  else await prisma.platformSetting.updateMany({ where: { id: "singleton" }, data: { organizerRevenueSettlementHours: originalSettlementHours } });
});

/**
 * A COMPLETE tournament whose cash prize is claimable: a staff organizer (so the prize is paid in full
 * rather than capped at what entry fees collected), ended two days ago, past the 24-hour release window,
 * approved for payout, with a single knockout final its winner is the champion of.
 */
async function completedTournament({ payoutApprovedAt = new Date(Date.now() - 47 * HOURS) }: { payoutApprovedAt?: Date | null } = {}) {
  // A Tournament points at an OrganizerProfile, not a bare User, so the organizer fixture is the one
  // that creates both. Staff, so payableFraction pays the prize in full instead of pro-rating it
  // against whatever entry fees were actually collected.
  const organizer = await createTestOrganizer({ isStaff: true });
  const champion = await createTestUser({ dateOfBirth: new Date("1995-06-15"), payoutMethodRef: "acct_test_payout" });
  const runnerUp = await createTestUser();

  const tournament = await prisma.tournament.create({
    data: {
      organizerId: organizer.id,
      name: `TEST-Payout-${uniqueSuffix()}`,
      game: "Test Game",
      participantCap: 8,
      registrationOpenAt: new Date(Date.now() - 10 * 24 * HOURS),
      registrationCloseAt: new Date(Date.now() - 9 * 24 * HOURS),
      startAt: new Date(Date.now() - 8 * 24 * HOURS),
      status: "COMPLETE",
      completedAt: new Date(Date.now() - 48 * HOURS),
      payoutApprovedAt,
      prizeAmount: PRIZE,
    },
  });
  await prisma.match.create({
    data: {
      tournamentId: tournament.id,
      matchCode: `TEST-${uniqueSuffix()}`,
      round: 1,
      playerAId: champion.id,
      playerBId: runnerUp.id,
      winnerId: champion.id,
      status: "COMPLETE",
    },
  });

  return { tournament, champion, runnerUp };
}

function asUser(user: { id: string } | null) {
  vi.mocked(getCurrentUser).mockResolvedValue(user as never);
}

function post(tournamentId: string) {
  return POST(new Request("http://localhost/api/tournaments/x/payout", { method: "POST" }), {
    params: Promise.resolve({ id: tournamentId }),
  });
}

describe("the money-out throttle (#17)", () => {
  it("pays the champion, and lets them claim their way out of a failing payout method five times", async () => {
    const { tournament, champion } = await completedTournament();
    asUser(champion);
    initiateTransfer.mockResolvedValue({ status: "FAILED", providerReference: "ps_payout" });

    for (let i = 0; i < 5; i++) expect((await post(tournament.id)).status).toBe(200);
    expect(initiateTransfer).toHaveBeenCalledTimes(5);

    const blocked = await post(tournament.id);

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    // Refused before the reservation, so the sixth attempt left nothing behind to reconcile.
    expect(initiateTransfer).toHaveBeenCalledTimes(5);
    expect(await prisma.escrowTransaction.count({ where: { tournamentId: tournament.id, type: "PRIZE_PAYOUT" } })).toBe(5);
  });

  it("does not spend the hour on claims that were never going to reach the provider", async () => {
    // "Prizes are released after Circuit staff review…" — the state a winner is most likely to come back
    // to, and a 409 that costs nothing and will say the same thing next time.
    const { tournament, champion } = await completedTournament({ payoutApprovedAt: null });
    asUser(champion);

    for (let i = 0; i < 6; i++) expect((await post(tournament.id)).status).toBe(409);

    await prisma.tournament.update({ where: { id: tournament.id }, data: { payoutApprovedAt: new Date() } });

    expect((await post(tournament.id)).status).toBe(200);
    expect(initiateTransfer).toHaveBeenCalledTimes(1);
  });

  it("keeps one account's hour out of another's", async () => {
    // FAILED transfers again: a successful claim is a one-off (the escrow row blocks the second
    // attempt), so a repeatable claim is the only way to walk one account up to its cap.
    initiateTransfer.mockResolvedValue({ status: "FAILED", providerReference: "ps_payout" });
    const first = await completedTournament();
    asUser(first.champion);
    for (let i = 0; i < 5; i++) await post(first.tournament.id);
    expect((await post(first.tournament.id)).status).toBe(429);

    const second = await completedTournament();
    asUser(second.champion);

    expect((await post(second.tournament.id)).status).toBe(200);
  });

  it("still pays a prize in full, so the cap is not refusing everything", async () => {
    const { tournament, champion } = await completedTournament();
    asUser(champion);

    const response = await post(tournament.id);

    expect(response.status).toBe(200);
    expect(((await response.json()) as { status: string }).status).toBe("SUCCESS");
    const row = await prisma.escrowTransaction.findFirstOrThrow({
      where: { tournamentId: tournament.id, type: "PRIZE_PAYOUT" },
    });
    expect(row).toMatchObject({ status: "COMPLETE", amount: PRIZE, userId: champion.id, place: 1 });
  });

  it("still refuses a signed-out caller before any of this", async () => {
    const { tournament } = await completedTournament();
    asUser(null);

    expect((await post(tournament.id)).status).toBe(401);
    expect(initiateTransfer).not.toHaveBeenCalled();
  });
});

/**
 * Finding 1a: a prize payout can go out twice.
 *
 * A payout the provider reports FAILED is marked FAILED rather than left PENDING, which deliberately
 * reopens the claim (finding #17's whole premise, above). That is right for the ordinary case — the call
 * errored, or the provider said no, and nothing left custody. But when the provider actually *did* pay and
 * Circuit recorded FAILED anyway, the champion comes back, is handed a brand-new reference, and is paid
 * again. Nothing would have noticed: the sweep only re-checks PENDING rows, and the claim check here only
 * counts PENDING and COMPLETE ones, so a FAILED row sat in the one state neither of them ever looked at.
 *
 * So the route asks the provider what became of the failed attempts before reserving a fresh reference.
 */
describe("the re-verify guard before a fresh claim (finding 1a)", () => {
  /** A FAILED prize-payout row already on the books for this champion — the reopened claim. */
  async function failedPayoutFor(
    tournamentId: string,
    userId: string,
    { provider = "PAYSTACK", amount = PRIZE }: { provider?: "PAYSTACK" | "FLUTTERWAVE"; amount?: number } = {}
  ) {
    const providerRef = `payout_${uniqueSuffix()}`;
    await prisma.escrowTransaction.create({
      data: { tournamentId, type: "PRIZE_PAYOUT", amount, userId, place: 1, provider, providerRef, status: "FAILED" },
    });
    return providerRef;
  }

  it("refuses to pay again when the provider says the failed attempt actually went out", async () => {
    const { tournament, champion } = await completedTournament();
    const attemptRef = await failedPayoutFor(tournament.id, champion.id);
    verifyTransfer.mockResolvedValue("SUCCESS");
    asUser(champion);

    const response = await post(tournament.id);

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toMatch(/already been paid out/i);
    // Nothing was reserved and nothing was sent — the whole point is that there is no second transfer.
    expect(initiateTransfer).not.toHaveBeenCalled();
    expect(await prisma.escrowTransaction.count({ where: { tournamentId: tournament.id, type: "PRIZE_PAYOUT" } })).toBe(1);
    // And the row stops lying about what happened: it goes through the same path a late webhook would take,
    // which is also what raises the alert naming the double payment.
    expect((await prisma.escrowTransaction.findUniqueOrThrow({ where: { providerRef: attemptRef } })).status).toBe("COMPLETE");
  });

  it("lets the champion claim when the provider confirms the earlier attempt never went out", async () => {
    // The retry the reopening exists for. Nothing about a genuine failure may be disturbed.
    const { tournament, champion } = await completedTournament();
    const attemptRef = await failedPayoutFor(tournament.id, champion.id);
    verifyTransfer.mockResolvedValue("FAILED");
    asUser(champion);

    const response = await post(tournament.id);

    expect(response.status).toBe(200);
    expect(initiateTransfer).toHaveBeenCalledTimes(1);
    expect((await prisma.escrowTransaction.findUniqueOrThrow({ where: { providerRef: attemptRef } })).status).toBe("FAILED");
    expect(await prisma.escrowTransaction.count({ where: { tournamentId: tournament.id, type: "PRIZE_PAYOUT", status: "COMPLETE" } })).toBe(1);
  });

  it("refuses while an earlier attempt is still in flight at the provider", async () => {
    // Not a state the app should be able to reach — a PENDING answer for a reference it recorded FAILED —
    // but "we cannot rule out that this was paid" is not a reason to hand out a second reference.
    const { tournament, champion } = await completedTournament();
    await failedPayoutFor(tournament.id, champion.id);
    verifyTransfer.mockResolvedValue("PENDING");
    asUser(champion);

    const response = await post(tournament.id);

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toMatch(/still being processed/i);
    expect(initiateTransfer).not.toHaveBeenCalled();
  });

  it("refuses rather than guessing when the provider cannot say", async () => {
    // The opposite of getBalance's "unknown, carry on": carrying on here can pay the same prize twice and
    // say nothing, while refusing only delays a claim that is already waiting on a release window.
    const { tournament, champion } = await completedTournament();
    await failedPayoutFor(tournament.id, champion.id);
    verifyTransfer.mockRejectedValue(new Error("paystack is down"));
    asUser(champion);

    const response = await post(tournament.id);

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(initiateTransfer).not.toHaveBeenCalled();
    expect(await prisma.escrowTransaction.count({ where: { tournamentId: tournament.id, type: "PRIZE_PAYOUT" } })).toBe(1);
    // Not silent: the capture is the only thing that says so if the provider is answering nobody.
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ stage: "reverifyFailedPayout", tournamentId: tournament.id })
    );
  });

  it("asks the failed attempt's own provider, not the default one", async () => {
    // Flutterwave is read-only legacy, but a FAILED row from back then still carries its reference and
    // still has to be asked of the provider that would know about it.
    const { tournament, champion } = await completedTournament();
    await failedPayoutFor(tournament.id, champion.id, { provider: "FLUTTERWAVE" });
    verifyTransfer.mockResolvedValue("SUCCESS");
    asUser(champion);

    expect((await post(tournament.id)).status).toBe(409);

    expect(getPaymentProvider).toHaveBeenCalledWith("FLUTTERWAVE");
    expect(verifyTransfer).toHaveBeenCalledTimes(1);
  });

  it("does not let another prize place's failed attempt block this champion", async () => {
    // Split prizes: each place claims its own share. One player's failed transfer is not this player's.
    const { tournament, champion, runnerUp } = await completedTournament();
    await failedPayoutFor(tournament.id, runnerUp.id);
    asUser(champion);

    const response = await post(tournament.id);

    expect(response.status).toBe(200);
    expect(initiateTransfer).toHaveBeenCalledTimes(1);
    // Never asked: there was nothing on this champion's side to ask about.
    expect(verifyTransfer).not.toHaveBeenCalled();
  });

  it("does not ask the provider about a prize it already knows is claimed", async () => {
    // The guard is for the one state nothing else looks at. A COMPLETE row is already caught by the
    // fast-path above, and re-asking about a payout that succeeded would be a provider call per request.
    const { tournament, champion } = await completedTournament();
    await prisma.escrowTransaction.create({
      data: { tournamentId: tournament.id, type: "PRIZE_PAYOUT", amount: PRIZE, userId: champion.id, place: 1, provider: "PAYSTACK", providerRef: `payout_${uniqueSuffix()}`, status: "COMPLETE" },
    });
    asUser(champion);

    const response = await post(tournament.id);

    expect(response.status).toBe(409);
    expect(verifyTransfer).not.toHaveBeenCalled();
    expect(initiateTransfer).not.toHaveBeenCalled();
  });
});
