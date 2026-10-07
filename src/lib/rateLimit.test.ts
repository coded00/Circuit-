import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { isRateLimited, recordAttempt, clearAttempts, getClientIp } from "./rateLimit";

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
