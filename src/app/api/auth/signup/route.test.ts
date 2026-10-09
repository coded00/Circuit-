import { afterEach, describe, expect, it, vi } from "vitest";
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
