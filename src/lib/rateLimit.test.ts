import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  AUTH_LIMITS,
  callerThrottleKeys,
  clearAttempts,
  getClientIp,
  isCallerThrottled,
  isRateLimited,
  recordAttempt,
  recordCallerAttempt,
} from "./rateLimit";

const TEST_KEY_PREFIX = "test-ratelimit-";

afterEach(async () => {
  await prisma.rateLimitAttempt.deleteMany({ where: { key: { startsWith: TEST_KEY_PREFIX } } });
});

describe("isRateLimited / recordAttempt", () => {
  it("is not limited before any attempts are recorded", async () => {
    const key = `${TEST_KEY_PREFIX}${Date.now()}`;
    const result = await isRateLimited(key, { max: 3, windowMs: 60_000 });
    expect(result.limited).toBe(false);
  });

  it("allows exactly `max` attempts, then limits the next one", async () => {
    const key = `${TEST_KEY_PREFIX}${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      const check = await isRateLimited(key, { max: 3, windowMs: 60_000 });
      expect(check.limited).toBe(false);
      await recordAttempt(key);
    }
    const finalCheck = await isRateLimited(key, { max: 3, windowMs: 60_000 });
    expect(finalCheck.limited).toBe(true);
    expect(finalCheck.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("attempts outside the window don't count against the limit", async () => {
    const key = `${TEST_KEY_PREFIX}${Date.now()}`;
    // Directly insert an old attempt (well outside a 1s window).
    await prisma.rateLimitAttempt.create({ data: { key, createdAt: new Date(Date.now() - 5_000) } });
    const result = await isRateLimited(key, { max: 1, windowMs: 1_000 });
    expect(result.limited).toBe(false);
  });

  it("clearAttempts resets the counter", async () => {
    const key = `${TEST_KEY_PREFIX}${Date.now()}`;
    await recordAttempt(key);
    await recordAttempt(key);
    await clearAttempts(key);
    const result = await isRateLimited(key, { max: 1, windowMs: 60_000 });
    expect(result.limited).toBe(false);
  });

  it("different keys don't share a limit", async () => {
    const keyA = `${TEST_KEY_PREFIX}a-${Date.now()}`;
    const keyB = `${TEST_KEY_PREFIX}b-${Date.now()}`;
    await recordAttempt(keyA);
    const resultB = await isRateLimited(keyB, { max: 1, windowMs: 60_000 });
    expect(resultB.limited).toBe(false);
  });
});

describe("getClientIp", () => {
  const request = (headers: Record<string, string>) => new Request("http://localhost", { headers });

  afterEach(() => {
    delete process.env.TRUSTED_PROXY_SECRET;
    delete process.env.TRUSTED_PROXY_IP_HEADER;
  });

  it("reads the last x-forwarded-for entry — the one the proxy appended — not the caller's own", () => {
    // This asserted `[0]` before the fix, which is the entry a caller controls: they pick the front of the
    // chain and the proxy appends the address it actually saw behind it.
    expect(getClientIp(request({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("5.6.7.8");
    expect(getClientIp(request({ "x-forwarded-for": "9.9.9.9" }))).toBe("9.9.9.9");
    // A trailing empty hop (some proxies leave ", ") is skipped, not returned as the answer.
    expect(getClientIp(request({ "x-forwarded-for": "5.6.7.8, " }))).toBe("5.6.7.8");
  });

  it("ignores a caller-supplied direct-IP header unless the request proved it came through the proxy", () => {
    // The regression: cf-connecting-ip used to be believed from anyone, so varying it took a fresh bucket
    // per request on every IP-keyed limit in the app.
    expect(getClientIp(request({ "cf-connecting-ip": "1.2.3.4" }))).toBe("unknown");
    expect(getClientIp(request({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" }))).toBe("5.6.7.8");

    process.env.TRUSTED_PROXY_SECRET = "s3cret";
    expect(getClientIp(request({ "cf-connecting-ip": "1.2.3.4" }))).toBe("unknown"); // no secret presented
    expect(getClientIp(request({ "cf-connecting-ip": "1.2.3.4", "x-circuit-proxy-secret": "wrong" }))).toBe("unknown");
    expect(getClientIp(request({ "cf-connecting-ip": "1.2.3.4", "x-circuit-proxy-secret": "s3cret" }))).toBe("1.2.3.4");
  });

  it("reads whichever header the operator names, once the secret proves the proxy", () => {
    process.env.TRUSTED_PROXY_SECRET = "s3cret";
    process.env.TRUSTED_PROXY_IP_HEADER = "x-real-ip";
    const headers = { "x-real-ip": "1.2.3.4", "cf-connecting-ip": "9.9.9.9", "x-circuit-proxy-secret": "s3cret" };
    expect(getClientIp(request(headers))).toBe("1.2.3.4");
  });

  it("falls back to 'unknown' when there is nothing to read", () => {
    expect(getClientIp(request({}))).toBe("unknown");
    expect(getClientIp(request({ "x-forwarded-for": "   " }))).toBe("unknown");
  });
});

/**
 * The caller layer: the two buckets that bound an auth route without depending on which account is being
 * attempted. Rows are seeded directly rather than by looping the real limits (100 and 1000 for login),
 * because what is under test is the arithmetic and the keying, not how many times a loop can run.
 */
describe("the caller layer", () => {
  const request = (headers: Record<string, string> = {}) => new Request("http://localhost", { headers });
  const fill = (key: string, times: number) =>
    prisma.rateLimitAttempt.createMany({ data: Array.from({ length: times }, () => ({ key })) });

  afterEach(async () => {
    delete process.env.TRUSTED_PROXY_SECRET;
    await prisma.rateLimitAttempt.deleteMany({ where: { key: { startsWith: "auth-ip:" } } });
    await prisma.rateLimitAttempt.deleteMany({ where: { key: { startsWith: "auth-global:" } } });
  });

  it("keys the caller bucket on the address and the global bucket on nothing at all", () => {
    expect(callerThrottleKeys("login", request({ "x-forwarded-for": "5.6.7.8" }))).toEqual({
      ip: "auth-ip:login:5.6.7.8",
      global: "auth-global:login",
    });
    // Scopes don't share: a signup flood at one address must not spend that address's login budget, or a
    // stranger's spam would lock people out of the thing they actually need.
    expect(callerThrottleKeys("signup", request({ "x-forwarded-for": "5.6.7.8" })).ip).toBe("auth-ip:signup:5.6.7.8");
    expect(callerThrottleKeys("signup", request({ "x-forwarded-for": "5.6.7.8" })).global).toBe("auth-global:signup");
  });

  it("refuses a caller that has spent its own budget, and nobody else", async () => {
    const spent = callerThrottleKeys("login", request({ "x-forwarded-for": "5.6.7.8" }));
    await fill(spent.ip, AUTH_LIMITS.login.caller.max);

    expect((await isCallerThrottled("login", spent)).limited).toBe(true);
    expect((await isCallerThrottled("login", spent)).retryAfterSeconds).toBeGreaterThan(0);
    // A different address is untouched — this is a per-source bound, not a platform-wide one, and getting
    // that the wrong way round would take the whole site's login down for one attacker.
    expect((await isCallerThrottled("login", callerThrottleKeys("login", request({ "x-forwarded-for": "9.9.9.9" })))).limited).toBe(false);
  });

  it("refuses every address once the global bucket is spent", async () => {
    // The layer a botnet meets: it does not depend on the attacker's address, only on the volume.
    await fill("auth-global:login", AUTH_LIMITS.login.global.max);
    for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
      expect((await isCallerThrottled("login", callerThrottleKeys("login", request({ "x-forwarded-for": ip })))).limited).toBe(true);
    }
  });

  it("allows exactly `max` recordings, then limits — and counts both buckets", async () => {
    const keys = callerThrottleKeys("login", request({ "x-forwarded-for": "5.6.7.8" }));
    for (let i = 0; i < AUTH_LIMITS.login.caller.max; i++) {
      expect((await isCallerThrottled("login", keys)).limited).toBe(false);
      await recordCallerAttempt(keys);
    }
    expect((await isCallerThrottled("login", keys)).limited).toBe(true);
    // Both written by the one call, so a route cannot record one and forget the other.
    expect(await prisma.rateLimitAttempt.count({ where: { key: keys.ip } })).toBe(AUTH_LIMITS.login.caller.max);
    expect(await prisma.rateLimitAttempt.count({ where: { key: keys.global } })).toBe(AUTH_LIMITS.login.caller.max);
  });

  it("cannot be handed a fresh bucket by a header the caller invented", () => {
    // This is the first IP-keyed limit in the app, which makes finding #13's fix load-bearing rather than
    // theoretical: the header below used to be believed from anyone, so varying it was a new bucket per
    // request and this whole layer would have been decorative.
    const first = callerThrottleKeys("login", request({ "cf-connecting-ip": "1.2.3.4" }));
    const second = callerThrottleKeys("login", request({ "cf-connecting-ip": "5.6.7.8" }));
    expect(first.ip).toBe(second.ip);
    expect(first.ip).toBe("auth-ip:login:unknown");
  });
});
