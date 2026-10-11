import { beforeEach, describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  ATTEMPT_RETENTION_MS,
  AUTH_LIMITS,
  PUBLIC_LIMITS,
  callerThrottleKeys,
  clearAttempts,
  getClientIp,
  isCallerThrottled,
  isRateLimited,
  purgeExpiredAttempts,
  recordAttempt,
  recordCallerAttempt,
  throttlePublicRequest,
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

/**
 * The public read layer: the bound on /api/search and /api/images, the two unauthenticated routes where an
 * anonymous caller can make the origin do real work (finding #11). One bucket, keyed on the address.
 *
 * Rows are seeded directly for the "already over the line" cases, as in the caller-layer block above — 600
 * and 1200 round trips to prove an arithmetic comparison is not worth the seconds it costs.
 */
describe("the public read layer", () => {
  const request = (headers: Record<string, string> = {}) => new Request("http://localhost", { headers });
  const fill = (key: string, times: number) =>
    prisma.rateLimitAttempt.createMany({ data: Array.from({ length: times }, () => ({ key })) });

  afterEach(async () => {
    delete process.env.TRUSTED_PROXY_SECRET;
    await prisma.rateLimitAttempt.deleteMany({ where: { key: { startsWith: "public-ip:" } } });
  });

  it("keys on the address and the scope, so the two routes don't spend each other's budget", async () => {
    const search = await throttlePublicRequest("search", request({ "x-forwarded-for": "5.6.7.8" }));
    expect(search.limited).toBe(false);
    // A page load asks for dozens of images; if that spent the search budget, browsing would lock out
    // searching, which is the kind of coupling that makes a limit feel broken rather than protective.
    expect(await prisma.rateLimitAttempt.count({ where: { key: "public-ip:images:5.6.7.8" } })).toBe(0);
    // And the other direction: a search flood must not take a carrier's images down.
    expect(await prisma.rateLimitAttempt.count({ where: { key: "public-ip:search:5.6.7.8" } })).toBe(1);
  });

  it("counts every request it lets through — there is no success/failure signal to gate on", async () => {
    // The difference from the auth routes: login counts only wrong passwords, but a search that returns
    // nothing still cost the origin four scans, so every accepted request here is recorded.
    await throttlePublicRequest("search", request({ "x-forwarded-for": "5.6.7.8" }));
    await throttlePublicRequest("search", request({ "x-forwarded-for": "5.6.7.8" }));
    expect(await prisma.rateLimitAttempt.count({ where: { key: "public-ip:search:5.6.7.8" } })).toBe(2);
  });

  it("refuses a caller that has spent its budget, and nobody else", async () => {
    await fill("public-ip:search:5.6.7.8", PUBLIC_LIMITS.search.max);

    const refused = await throttlePublicRequest("search", request({ "x-forwarded-for": "5.6.7.8" }));
    expect(refused.limited).toBe(true);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    // Per-source, not platform-wide: one attacker must not be able to stop everyone else searching.
    expect((await throttlePublicRequest("search", request({ "x-forwarded-for": "9.9.9.9" }))).limited).toBe(false);
  });

  it("does not let a refused request extend its own block", async () => {
    await fill("public-ip:search:5.6.7.8", PUBLIC_LIMITS.search.max);
    await throttlePublicRequest("search", request({ "x-forwarded-for": "5.6.7.8" }));
    await throttlePublicRequest("search", request({ "x-forwarded-for": "5.6.7.8" }));
    // Still exactly the seeded rows: a caller hammering the door does not push their own retry-after out,
    // which would turn a one-minute limit into an indefinite lockout for a shared carrier address.
    expect(await prisma.rateLimitAttempt.count({ where: { key: "public-ip:search:5.6.7.8" } })).toBe(PUBLIC_LIMITS.search.max);
  });

  it("cannot be handed a fresh bucket by a header the caller invented", async () => {
    // The same failure that made finding #13 load-bearing: cf-connecting-ip used to be believed from anyone,
    // so varying it would be a new bucket per request and both of these limits would be decorative.
    const first = await throttlePublicRequest("search", request({ "cf-connecting-ip": "1.2.3.4" }));
    const second = await throttlePublicRequest("search", request({ "cf-connecting-ip": "5.6.7.8" }));
    expect(first.limited).toBe(false);
    expect(second.limited).toBe(false);
    expect(await prisma.rateLimitAttempt.count({ where: { key: "public-ip:search:unknown" } })).toBe(2);
  });

  it("is measured per minute for both scopes", () => {
    // Pins the window against a copy-paste of the 15-minute auth constant, which would quietly turn these
    // into 600-an-hour limits — an order of magnitude tighter than what the comment in rateLimit.ts argues for.
    expect(PUBLIC_LIMITS.search.windowMs).toBe(60_000);
    expect(PUBLIC_LIMITS.images.windowMs).toBe(60_000);
    // Images is the looser of the two, because one page load legitimately asks for dozens.
    expect(PUBLIC_LIMITS.images.max).toBeGreaterThan(PUBLIC_LIMITS.search.max);
  });
});

/**
 * Finding #14: the attempts table grew without bound.
 *
 * `isRateLimited` clears the key it is asked about, so a key nobody asks about again kept its rows
 * forever — and on the unauthenticated routes the *caller* chooses how many keys there are, because they
 * come out of request bodies and headers. `purgeExpiredAttempts` is the sweep that clears the rest.
 *
 * Aging is done by writing `createdAt` directly rather than by waiting or by faking the clock, so each
 * case states its own age and nothing depends on how long the suite took to reach it.
 */
describe("purging expired attempts", () => {
  const PURGE_PREFIX = "test-purge-";
  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);
  const age = (key: string, h: number) => ({ key, createdAt: hoursAgo(h) });
  const remaining = (key: string) => prisma.rateLimitAttempt.count({ where: { key } });

  beforeEach(async () => {
    // Drain whatever is already past retention before seeding — on a shared dev database that is whatever
    // an earlier run left behind — so the counts below are this test's own rows and nothing else.
    await purgeExpiredAttempts();
    await prisma.rateLimitAttempt.deleteMany({ where: { key: { startsWith: PURGE_PREFIX } } });
  });

  afterEach(async () => {
    await prisma.rateLimitAttempt.deleteMany({ where: { key: { startsWith: PURGE_PREFIX } } });
  });

  it("deletes what is past retention and leaves what is inside it", async () => {
    await prisma.rateLimitAttempt.createMany({
      data: [age(`${PURGE_PREFIX}old`, 72), age(`${PURGE_PREFIX}old`, 73), age(`${PURGE_PREFIX}old`, 74), age(`${PURGE_PREFIX}old`, 1), age(`${PURGE_PREFIX}old`, 47)],
    });

    expect(await purgeExpiredAttempts()).toBe(3);
    expect(await remaining(`${PURGE_PREFIX}old`)).toBe(2);
  });

  it("sweeps every key, not just the one it was asked about", async () => {
    // The regression itself. The opportunistic cleanup inside isRateLimited would have left all of these
    // behind: no caller is ever going to query `test-purge-abandoned-1` again, which is precisely why the
    // rows sat there. A purge that only knew about one key would pass the test above and fail this one.
    await prisma.rateLimitAttempt.createMany({
      data: [1, 2, 3, 4, 5].map((n) => age(`${PURGE_PREFIX}abandoned-${n}`, 100 + n)),
    });

    await purgeExpiredAttempts();
    for (const n of [1, 2, 3, 4, 5]) expect(await remaining(`${PURGE_PREFIX}abandoned-${n}`)).toBe(0);
  });

  it("stops at the run's ceiling, leaving the rest for the next run", async () => {
    // Bounded so a table somebody deliberately grew cannot turn one sweep into one long transaction — the
    // same sweep is what expires Battles and approves payouts, so stalling it is the thing to avoid.
    await prisma.rateLimitAttempt.createMany({
      data: Array.from({ length: 5 }, (_, i) => age(`${PURGE_PREFIX}bounded-${i}`, 100 + i)),
    });

    expect(await purgeExpiredAttempts(new Date(), { batchSize: 2, maxPerRun: 2 })).toBe(2);
    // Three left, because the ceiling stopped it rather than the range being exhausted — which rows went is
    // unspecified, so this counts the survivors instead of naming them.
    const left = await prisma.rateLimitAttempt.count({ where: { key: { startsWith: `${PURGE_PREFIX}bounded-` } } });
    expect(left).toBe(3);
    // Still removing rather than giving up — the backlog drains over the runs that follow.
    expect(await purgeExpiredAttempts(new Date(), { batchSize: 2, maxPerRun: 2 })).toBe(2);
    expect(await purgeExpiredAttempts(new Date(), { batchSize: 2, maxPerRun: 2 })).toBe(1);
    for (let i = 0; i < 5; i++) expect(await remaining(`${PURGE_PREFIX}bounded-${i}`)).toBe(0);
  });

  it("keeps rows for longer than any window that could still read them", () => {
    // The one failure here that would be a security regression rather than a cost: deleting a row inside a
    // live window would make a limit looser than the number it advertises, silently. This pins the
    // relationship for the windows this module owns...
    const owned = [
      ...Object.values(AUTH_LIMITS).flatMap((l) => [l.identifier.windowMs, l.caller.windowMs, l.global.windowMs]),
      ...Object.values(PUBLIC_LIMITS).map((l) => l.windowMs),
    ];
    expect(ATTEMPT_RETENTION_MS).toBeGreaterThan(Math.max(...owned));

    // ...and, by value, for the longest one it does not: the 24-hour community-create limit in
    // src/app/api/communities/route.ts. That number is not reachable from here, so it is written down
    // instead — and if a window ever grows past the retention, this is the tripwire that says so.
    expect(ATTEMPT_RETENTION_MS).toBeGreaterThanOrEqual(2 * 24 * 60 * 60 * 1000);
  });

  it("does not loosen a limit that is currently in force", async () => {
    const key = `${PURGE_PREFIX}live`;
    await prisma.rateLimitAttempt.createMany({ data: Array.from({ length: 3 }, () => ({ key })) });

    await purgeExpiredAttempts();

    // Three fresh rows are inside a 15-minute window, so the key is still at its cap — the purge must not
    // have touched rows a live limit is counting.
    expect((await isRateLimited(key, { max: 3, windowMs: 15 * 60 * 1000 })).limited).toBe(true);
  });
});
