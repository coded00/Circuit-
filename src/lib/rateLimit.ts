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

import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";

/** Where a trusted reverse proxy puts the visitor's address, and the shared secret proving the request came
 *  through it. Both are operator-set — see docs/self-hosting.md. */
const PROXY_SECRET_HEADER = "x-circuit-proxy-secret";
const DEFAULT_PROXY_IP_HEADER = "cf-connecting-ip";

function proxyIpHeader(): string {
  return process.env.TRUSTED_PROXY_IP_HEADER?.trim() || DEFAULT_PROXY_IP_HEADER;
}

/** Did this request present the configured proxy secret? Same length-checked compare as the webhook
 *  verifiers (src/lib/payments/webhookVerification.ts) — timingSafeEqual throws on unequal lengths. */
function cameThroughTrustedProxy(request: Request): boolean {
  const expected = process.env.TRUSTED_PROXY_SECRET;
  const provided = request.headers.get(PROXY_SECRET_HEADER);
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Best-effort client IP for rate-limiting an unauthenticated route (no userId to key on).
 *
 * **Nothing in a request is trustworthy on its own.** Every header this reads is just text a caller can
 * set, so the value is only as good as what sits in front of the app:
 *
 * - A header naming the visitor directly (`cf-connecting-ip`, `x-real-ip`) has no chain to reason about.
 *   Cloudflare sets it itself and overwrites whatever the client sent — but only for traffic that actually
 *   went through Cloudflare. On an origin that is *also* reachable directly (a Vercel deployment, or a box
 *   with the app port open) a caller sends it themselves. So it is believed only when the request also
 *   carries `TRUSTED_PROXY_SECRET`, which the proxy injects and a caller cannot guess.
 * - Otherwise it reads the **last** entry of `x-forwarded-for`. A proxy that appends (Caddy's default, and
 *   nginx's `$proxy_add_x_forwarded_for`) leaves the caller's own claimed entries on the left and adds the
 *   address it actually saw on the right, so the last entry is the real one and the first is whatever the
 *   caller wrote. Reading `[0]` — which this function used to do — handed every caller a free choice of
 *   rate-limit bucket, one per entry they invented.
 *
 * The fallback assumes the single reverse proxy docs/pre-launch-checklist.md asks for. With two proxies in
 * the chain the entry you want is further left, which is exactly why a Cloudflare-fronted deployment should
 * set the secret above rather than lean on this.
 *
 * With neither available the answer is `"unknown"`, which shares one bucket across such requests — coarse,
 * but coarse is the failure mode to prefer: it over-limits rather than under-limits.
 */
export function getClientIp(request: Request): string {
  if (cameThroughTrustedProxy(request)) {
    const direct = request.headers.get(proxyIpHeader())?.trim();
    if (direct) return direct;
  }

  // Walk from the right: the last non-empty hop is the one our own proxy appended.
  const chain = request.headers.get("x-forwarded-for")?.split(",") ?? [];
  for (let i = chain.length - 1; i >= 0; i--) {
    const hop = chain[i].trim();
    if (hop) return hop;
  }
  return "unknown";
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
