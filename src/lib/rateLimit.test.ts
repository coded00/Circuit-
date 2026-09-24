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
  it("returns the first entry of x-forwarded-for", () => {
    const request = new Request("http://localhost", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(getClientIp(request)).toBe("1.2.3.4");
  });

  it("falls back to 'unknown' when the header is absent", () => {
    const request = new Request("http://localhost");
    expect(getClientIp(request)).toBe("unknown");
  });
});
