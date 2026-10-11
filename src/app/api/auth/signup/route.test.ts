import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { AUTH_LIMITS } from "@/lib/rateLimit";
import { cleanupAll, uniqueSuffix } from "@/testHelpers";
import { POST } from "./route";

/**
 * Finding #8, on the route where its "signup with distinct emails is unbounded" half lived.
 *
 * The per-email bucket does not bound this attack and never did: a fresh address is an empty bucket, and
 * the attack's whole shape is a fresh address each time. So the tests here are about the two layers that
 * do not depend on the address — one caller, and the platform — and about the thing that makes signup
 * different from login: the attack *succeeds*. An account is created, and the creations are the damage.
 * A rule that counted only failures would watch it happen.
 */

vi.mock("@/lib/emailVerification", () => ({ sendVerificationEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/accountEmails", () => ({ sendAlreadyRegisteredNotice: vi.fn(async () => undefined) }));

const { sendAlreadyRegisteredNotice } = await import("@/lib/accountEmails");

const PASSWORD = "correct-horse-battery-staple";
const IP = "203.0.113.9";
const ipKey = `auth-ip:signup:${IP}`;

/** A valid signup that would create an account if it got that far. */
function payload(over: Record<string, unknown> = {}) {
  const clean = uniqueSuffix().replace(/[^a-z0-9]/gi, "");
  return {
    name: `TEST-Signup-${clean}`.slice(0, 40),
    email: `test-signup-${clean}@example.com`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    acceptTerms: true,
    handle: `t${clean}`.slice(0, 20).toLowerCase(),
    country: "NG",
    dateOfBirth: "1995-06-15",
    ...over,
  };
}

const signupFrom = (ip: string, body: unknown) =>
  POST(
    new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    })
  );

const fill = (key: string, times: number) =>
  prisma.rateLimitAttempt.createMany({ data: Array.from({ length: times }, () => ({ key })) });

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAll();
});

describe("signup caller throttling", () => {
  it("refuses a caller that has spent its budget, and creates no account", async () => {
    // The assertion that matters is the second one. A limit checked after the account exists would leave
    // the attacker with the account and only refuse the *response*, which bounds nothing at all.
    await fill(ipKey, AUTH_LIMITS.signup.caller.max);
    const body = payload();

    const blocked = await signupFrom(IP, body);

    expect(blocked.status).toBe(429);
    expect(await prisma.user.count({ where: { email: body.email as string } })).toBe(0);
  });

  it("counts signups that succeed, so fresh addresses buy nothing", async () => {
    // The finding in one test. Two signups, two different emails, neither one ever seen before — so the
    // per-email bucket has nothing to say and this can only be bounded by the caller's own record.
    await fill(ipKey, AUTH_LIMITS.signup.caller.max - 1);

    expect((await signupFrom(IP, payload())).status).toBe(201);
    expect((await signupFrom(IP, payload())).status).toBe(429);
  });

  it("counts a rejected signup too", async () => {
    // A 409 spends the caller's budget like anything else. Otherwise the cheapest way to probe which
    // addresses are registered would be the one path with no cost attached to it. Two slots are left here
    // rather than one, so the 409 is genuinely reached instead of being refused by the budget first — a
    // test that passed for the wrong reason.
    await fill(ipKey, AUTH_LIMITS.signup.caller.max - 2);

    const taken = payload();
    expect((await signupFrom(IP, taken)).status).toBe(201);
    expect((await signupFrom(IP, payload({ email: taken.email }))).status).toBe(409);
    expect((await signupFrom(IP, payload())).status).toBe(429);
  });

  it("does not spend a caller's budget on a payload that never reached the database", async () => {
    // The deliberate exception: a malformed field is refused before anything touches the database, so it
    // costs nothing to answer. Spending a shared carrier address's budget on a client that cannot spell
    // its own birthday would take a whole network's signups down for a typo.
    const refused = await signupFrom(IP, payload({ dateOfBirth: "not-a-date" }));
    expect(refused.status).toBe(400);

    expect(await prisma.rateLimitAttempt.count({ where: { key: ipKey } })).toBe(0);
  });
});

/**
 * Finding #19, and the half of it the tests above cannot reach: when email can actually be delivered,
 * signup stops answering "that address is taken" and starts answering everything the same way.
 *
 * The key is set for this block only. Without it the route keeps the old behaviour on purpose (that is
 * what the block above pins), which is why the two modes are tested against the same payloads.
 */
describe("signup with email configured (finding #19)", () => {
  const savedKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.mocked(sendAlreadyRegisteredNotice).mockClear();
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedKey;
  });

  /** Registered accounts are created through the route, so the fixture and the thing under test agree. */
  async function registered(body: ReturnType<typeof payload>) {
    expect((await signupFrom(IP, body)).status).toBe(201);
    return body;
  }

  it("answers a taken address exactly as it answers a free one", async () => {
    const taken = await registered(payload());

    // The payloads differ in their handle, because the second signup cannot reuse the first's — so the
    // thing to compare is the shape and what it echoes, not the two bodies wholesale. What the caller
    // learns from either response: `{ pending: true }` and their own handle back. Nothing else.
    const freshPayload = payload();
    const existingPayload = payload({ email: taken.email });

    const fresh = await signupFrom(IP, freshPayload);
    const existing = await signupFrom(IP, existingPayload);

    expect(fresh.status).toBe(201);
    expect(existing.status).toBe(201);
    expect(await fresh.json()).toEqual({ pending: true, handle: freshPayload.handle });
    expect(await existing.json()).toEqual({ pending: true, handle: existingPayload.handle });
    // Without the fix the second response was a 409 naming the field — which told anyone who asked
    // whether an address is registered. It is now the same 201, signing nobody in.
    expect(existing.headers.get("set-cookie")).toBeNull();
    expect(fresh.headers.get("set-cookie")).toBeNull();
  });

  it("does not create a second account for the taken address", async () => {
    const taken = await registered(payload());

    await signupFrom(IP, payload({ email: taken.email }));

    expect(await prisma.user.count({ where: { email: taken.email as string } })).toBe(1);
  });

  it("tells the address's owner, since the caller is told nothing", async () => {
    const taken = await registered(payload());
    vi.mocked(sendAlreadyRegisteredNotice).mockClear();

    await signupFrom(IP, payload({ email: taken.email }));

    expect(sendAlreadyRegisteredNotice).toHaveBeenCalledWith(taken.email);
  });

  it("covers the phone the same way, because a phone is the same fact about a person", async () => {
    const phone = "+2348030001234";
    const first = await registered(payload({ phone }));
    vi.mocked(sendAlreadyRegisteredNotice).mockClear();

    const clash = await signupFrom(IP, payload({ phone }));

    expect(clash.status).toBe(201);
    expect(clash.headers.get("set-cookie")).toBeNull();
    expect(await prisma.user.count({ where: { phone } })).toBe(1);
    expect(sendAlreadyRegisteredNotice).toHaveBeenCalledWith(first.email);
  });

  it("costs a conflict what a success costs, so the clock is not an oracle either", async () => {
    // The half of #19 that survives any change to the response's shape. bcrypt dominates this handler and
    // is now paid before the answer is known; a conflict that skipped it came back roughly thirty times
    // faster, which any client can read off the wire. The threshold is deliberately loose — both paths
    // are ~300ms of bcrypt, so a third of the success time is nowhere near either outcome, and the gap it
    // has to catch is a factor of thirty rather than a few percent.
    const taken = await registered(payload());

    const freshStart = performance.now();
    await signupFrom(IP, payload());
    const freshMs = performance.now() - freshStart;

    const takenStart = performance.now();
    await signupFrom(IP, payload({ email: taken.email }));
    const takenMs = performance.now() - takenStart;

    expect(takenMs).toBeGreaterThan(freshMs / 3);
  });

  it("still refuses a taken handle plainly — that one is public information", async () => {
    const taken = await registered(payload());

    const clash = await signupFrom(IP, payload({ handle: taken.handle }));

    expect(clash.status).toBe(409);
    expect(((await clash.json()) as { field: string }).field).toBe("handle");
  });

  it("still charges a conflict to the caller's budget, so probing is not free", async () => {
    const taken = await registered(payload());
    const before = await prisma.rateLimitAttempt.count({ where: { key: ipKey } });

    await signupFrom(IP, payload({ email: taken.email }));

    expect(await prisma.rateLimitAttempt.count({ where: { key: ipKey } })).toBe(before + 1);
  });

  it("goes back to signing in when no provider is configured", async () => {
    // The other half of the switch, so the gate itself is pinned rather than assumed: with no key there
    // is no link to send, and deferring the session would lock a new account out of a site it can never
    // finish joining.
    delete process.env.RESEND_API_KEY;
    const taken = await registered(payload());

    const fresh = await signupFrom(IP, payload());
    const existing = await signupFrom(IP, payload({ email: taken.email }));

    expect(fresh.status).toBe(201);
    expect(fresh.headers.get("set-cookie")).toContain("circuit_session");
    expect(existing.status).toBe(409);
  });
});
