/**
 * Circuit — Postgres-backed rate limiting (ACC-5). See
 * docs/circuit-stack.md's Rate limiting section for why this is a plain
 * attempts table and not Redis at V1's traffic.
 *
 * Only failures count against the limit, not every request — a
 * legitimate user logging in correctly should never get rate-limited by
 * their own normal use. Callers check `isRateLimited` first, then call
 * `recordAttempt` only when the thing they attempted actually failed
 * (or, for a route with no real success/failure signal to the caller —
 * forgot-password always returns the same generic response either way —
 * on every call, since that's the only honest way to bound it).
 * `clearAttempts` lets a successful login reset the counter for that
 * identifier instead of leaving stale failures sitting in the window.
 */

import { prisma } from "@/lib/db";

/**
 * Best-effort client IP for rate-limiting an unauthenticated route (no
 * userId to key on) — `x-forwarded-for`'s first entry is the original
 * client on Vercel's proxy chain. Falls back to a fixed key when absent
 * (local dev, or a header-stripping proxy) rather than throwing; worst
 * case that shares one rate-limit bucket across such requests, which is
 * strictly safer than not limiting them at all.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const first = forwardedFor?.split(",")[0]?.trim();
  return first || "unknown";
}

export async function isRateLimited(
  key: string,
  { max, windowMs }: { max: number; windowMs: number }
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const windowStart = new Date(Date.now() - windowMs);

  // Opportunistic cleanup for this key — keeps the table from growing
  // unbounded without needing the (not-yet-wired) cron sweep to do it.
  await prisma.rateLimitAttempt.deleteMany({ where: { key, createdAt: { lt: windowStart } } });

  const attempts = await prisma.rateLimitAttempt.findMany({
    where: { key, createdAt: { gte: windowStart } },
    orderBy: { createdAt: "asc" },
    take: max,
  });

  if (attempts.length < max) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  const retryAfterMs = attempts[0].createdAt.getTime() + windowMs - Date.now();
  return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
}

export async function recordAttempt(key: string): Promise<void> {
  await prisma.rateLimitAttempt.create({ data: { key } });
}

export async function clearAttempts(key: string): Promise<void> {
  await prisma.rateLimitAttempt.deleteMany({ where: { key } });
}
