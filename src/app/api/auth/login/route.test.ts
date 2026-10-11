import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { AUTH_LIMITS } from "@/lib/rateLimit";
import { createTestUser, cleanupAll } from "@/testHelpers";
import { POST } from "./route";

/**
 * Regression test for the Phase 9 fix: the login throttle was keyed on the
 * identifier exactly as typed (`login:${emailOrPhone.toLowerCase()}`), while
 * findUserByIdentifier deliberately folds every common spelling of a phone
 * number onto one account. One account therefore had one bucket per spelling
 * — "08031234567", "0803 123 4567", "+2348031234567" — and each fresh spelling
 * bought another full window of five password guesses, which is the throttle's
 * whole job undone. The key now comes from the account the lookup resolved
 * (throttleKeyFor, src/lib/accountLookup.ts).
 */

const PHONE = "+2348031234567";
const PASSWORD = "correct-horse-battery-staple";

/** Five spellings of one number, each of which a real login form accepts. */
const SPELLINGS = ["08031234567", "0803 123 4567", "0803-123-4567", "+2348031234567", "2348031234567"];
/** A sixth, used nowhere above — so on its own it can never be a bucket with history in it. */
const UNSEEN = "0803.123.4567";
/** The seventh, only ever used for a correct password. */
const TRUE_PASSWORD_SPELLING = "+234 803 123 4567";

const login = (emailOrPhone: string, password = "not-the-password") =>
  POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emailOrPhone, password }),
    })
  );

/** The same, from a named address — so the caller-wide buckets can be driven without every test in the
 *  file sharing the "unknown" bucket that a header-less request lands in. */
const loginFrom = (ip: string, emailOrPhone: string, password = "not-the-password") =>
  POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ emailOrPhone, password }),
    })
  );

// Every key this file's throttle can be filed under: the account id once the fix is in, the raw spelling when
// it is reverted. cleanupAll only sweeps keys containing "test-", so these must be removed explicitly or they
// leak into the next run's window. (The caller-wide buckets — auth-ip:/auth-global: — are swept by cleanupAll
// itself, so they need nothing here.)
const keys = new Set(
  [...SPELLINGS, UNSEEN, TRUE_PASSWORD_SPELLING, PHONE].map((s) => `login:${s.toLowerCase()}`)
);

afterEach(async () => {
  await prisma.rateLimitAttempt.deleteMany({ where: { key: { in: [...keys] } } });
  keys.clear();
  await cleanupAll();
});

/** A phone-signup account, and every key its throttle may be filed under. */
async function phoneAccount() {
  const account = await createTestUser({ phone: PHONE, passwordHash: await hashPassword(PASSWORD) });
  keys.add(`login:${account.id}`);
  return account;
}

describe("login throttle", () => {
  it("counts every spelling of one phone number against the account's five attempts", async () => {
    await phoneAccount();

    // Five failures, each in a different spelling: before the fix each opened
    // its own bucket, so all five landed on an empty counter.
    for (const spelling of SPELLINGS) {
      expect((await login(spelling)).status).toBe(401);
    }

    // A sixth guess — in a spelling never used before, so it cannot be a bucket
    // of its own — is refused. One account, one bucket.
    const blocked = await login(UNSEEN);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });

  it("still lets the true password in, and a success clears the shared bucket", async () => {
    await phoneAccount();
    for (const spelling of SPELLINGS.slice(0, 3)) {
      expect((await login(spelling)).status).toBe(401);
    }

    // The real password, typed in a spelling used by none of the failures above.
    const ok = await login(TRUE_PASSWORD_SPELLING, PASSWORD);
    expect(ok.status).toBe(200);

    // Those three failures were cleared, so a full five are available again —
    // without the clear, the third of these would already be refused.
    for (const spelling of SPELLINGS) {
      expect((await login(spelling)).status).toBe(401);
    }
    expect((await login(UNSEEN)).status).toBe(429);
  });

  it("folds the spellings of a number that has no account on it too", async () => {
    // Nothing was created for PHONE in this test: the account lookup resolves
    // nothing, so the key falls back to the normalised identifier. Probing
    // identifiers nobody has must stay as bounded as probing one that exists.
    for (const spelling of SPELLINGS) {
      expect((await login(spelling)).status).toBe(401);
    }
    expect((await login(UNSEEN)).status).toBe(429);
  });
});

/**
 * Finding #8: every bucket used to key on the identifier, so an attacker working through a leaked list got
 * a fresh window per address and nothing bounded attempts *across* accounts. The per-account tests above are
 * untouched by this and stay the account's own limit; these are the layer that no longer depends on which
 * account is being tried.
 */
describe("login caller throttling", () => {
  const IP = "203.0.113.7";
  const ipKey = `auth-ip:login:${IP}`;
  const globalKey = "auth-global:login";
  const fill = (key: string, times: number) =>
    prisma.rateLimitAttempt.createMany({ data: Array.from({ length: times }, () => ({ key })) });

  it("refuses a caller that has spent its budget, on an account with no failures of its own", async () => {
    // The account below has never had a wrong password, so a refusal here can only come from the caller's
    // own record — the thing the finding said did not exist. Even the *correct* password is refused, which
    // is the behaviour a throttle has to have: letting through the one guess that happened to work would be
    // the guard opening for exactly the person it is guarding against.
    const account = await createTestUser({ emailOrPhone: "victim@example.com", passwordHash: await hashPassword(PASSWORD) });
    keys.add(`login:${account.id}`);
    keys.add("login:victim@example.com");
    await fill(ipKey, AUTH_LIMITS.login.caller.max);

    const blocked = await loginFrom(IP, "victim@example.com", PASSWORD);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });

  it("refuses every address once the platform-wide bucket is spent", async () => {
    // The layer a botnet meets. Without it the per-caller limit is only as good as the attacker's supply
    // of addresses, which is the one resource an attacker has plenty of.
    await fill(globalKey, AUTH_LIMITS.login.global.max);
    expect((await loginFrom("198.51.100.1", "nobody@example.com")).status).toBe(429);
    expect((await loginFrom("198.51.100.2", "nobody@example.com")).status).toBe(429);
  });

  it("does not hand the caller's budget back when a login succeeds", async () => {
    const account = await createTestUser({ phone: PHONE, passwordHash: await hashPassword(PASSWORD) });
    keys.add(`login:${account.id}`);

    expect((await loginFrom(IP, PHONE, "wrong")).status).toBe(401);
    expect(await prisma.rateLimitAttempt.count({ where: { key: ipKey } })).toBe(1);

    expect((await loginFrom(IP, PHONE, PASSWORD)).status).toBe(200);

    // Still spent: anyone holding one valid credential could otherwise clear their own budget between
    // guesses at everybody else's.
    expect(await prisma.rateLimitAttempt.count({ where: { key: ipKey } })).toBe(1);
    // ...while the account's own failures did go, which is the one thing clearAttempts is for.
    expect(await prisma.rateLimitAttempt.count({ where: { key: `login:${account.id}` } })).toBe(0);
  });

  it("puts requests carrying no address at all into one shared bucket", async () => {
    // The coarse failure mode, pinned deliberately. With nothing readable every caller is "unknown" and
    // shares a budget, so a deployment that strips x-forwarded-for gets one near-global bucket rather than
    // per-caller ones. That is still the direction to fail in — it over-limits rather than under-limits —
    // but it is the behaviour, not an accident, so it is asserted rather than discovered.
    await fill("auth-ip:login:unknown", AUTH_LIMITS.login.caller.max);
    expect((await login("someone@example.com")).status).toBe(429);
  });
});
