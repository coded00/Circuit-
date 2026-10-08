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

// ---------------------------------------------------------------------------
// Caller-wide throttling for the public auth routes
// ---------------------------------------------------------------------------

/** The public auth routes that get throttled. Each has its own numbers below. */
export type AuthScope = "login" | "signup" | "forgot-password";

type Limit = { max: number; windowMs: number };

const QUARTER_HOUR_MS = 15 * 60 * 1000;

/**
 * Every number a public auth route is throttled by, in one table.
 *
 * Three layers, because each one alone leaves a way through:
 *
 * - `identifier` bounds one account. It is the oldest of the three and it is what stops someone guessing
 *   one password. It does **not** bound an attacker working through a leaked list, because each address
 *   they try opens a fresh window of its own.
 * - `caller` bounds one source, whatever accounts it is working through. That is the hole the identifier
 *   layer left: without it, ten thousand addresses buy ten thousand windows.
 * - `global` bounds the platform. A per-caller limit alone is defeated by a botnet, and this is the only
 *   layer that does not depend on the attacker's address at all.
 *
 * The numbers are deliberately loose, and the reason is the same for both extra layers: on a Nigerian
 * mobile network most traffic arrives from a handful of carrier-grade NAT addresses, so every limit here
 * is shared by strangers who have never met. A tight per-caller limit would let one attacker lock a whole
 * carrier's customers out of logging in. So these bound *throughput* — an attacker gets a few hundred
 * guesses an hour instead of tens of thousands — rather than trying to identify anyone. The global layer
 * being hit at all is an attack signature, not a busy day, which is why it is set where it is.
 *
 * Only the identifier layer counts successes' opposite; see `recordCallerAttempt` for what counts where.
 */
export const AUTH_LIMITS: Record<AuthScope, { identifier: Limit; caller: Limit; global: Limit }> = {
  login: {
    identifier: { max: 5, windowMs: QUARTER_HOUR_MS },
    caller: { max: 100, windowMs: QUARTER_HOUR_MS },
    global: { max: 1000, windowMs: QUARTER_HOUR_MS },
  },
  signup: {
    identifier: { max: 5, windowMs: QUARTER_HOUR_MS },
    caller: { max: 30, windowMs: QUARTER_HOUR_MS },
    global: { max: 500, windowMs: QUARTER_HOUR_MS },
  },
  "forgot-password": {
    identifier: { max: 3, windowMs: QUARTER_HOUR_MS },
    caller: { max: 30, windowMs: QUARTER_HOUR_MS },
    global: { max: 500, windowMs: QUARTER_HOUR_MS },
  },
};

export type CallerThrottleKeys = { ip: string; global: string };

/**
 * The two buckets that bound an auth route without depending on which account is being attempted.
 *
 * They are built and checked separately from the identifier bucket because they need nothing from the
 * database — so a route can refuse a caller that is already over the line *before* it does the account
 * lookup, which is the whole point of a limit under attack: shedding load rather than doing the work and
 * then deciding not to.
 */
export function callerThrottleKeys(scope: AuthScope, request: Request): CallerThrottleKeys {
  return { ip: `auth-ip:${scope}:${getClientIp(request)}`, global: `auth-global:${scope}` };
}

/** Is the caller over either of its limits? Reports the first that trips, with its own retry-after. */
export async function isCallerThrottled(
  scope: AuthScope,
  keys: CallerThrottleKeys
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const byCaller = await isRateLimited(keys.ip, AUTH_LIMITS[scope].caller);
  if (byCaller.limited) return byCaller;
  return isRateLimited(keys.global, AUTH_LIMITS[scope].global);
}

/**
 * Count one attempt against both caller buckets.
 *
 * What counts is the route's decision, and the routes disagree on purpose:
 *
 * - login counts only *failed* passwords, because a correct one is not an attack and counting it would
 *   spend a shared carrier's budget on its own customers.
 * - signup counts every attempt, because the attack this bounds is mass account creation that *succeeds*.
 * - forgot-password counts every call, because it always answers the same thing and so has no
 *   success/failure signal to gate on.
 *
 * Called after `isCallerThrottled` has passed, so a request that was refused does not extend its own
 * block. Note that a *success* never clears these buckets — `clearAttempts` is for the identifier bucket
 * only. An attacker who knows one valid credential would otherwise reset their own budget by logging in
 * with it between guesses.
 */
export async function recordCallerAttempt(keys: CallerThrottleKeys): Promise<void> {
  await prisma.rateLimitAttempt.createMany({ data: [{ key: keys.ip }, { key: keys.global }] });
}

// ---------------------------------------------------------------------------
// Per-caller throttling for the unauthenticated public read routes
// ---------------------------------------------------------------------------

/** The public read routes where an anonymous caller can make the origin do real work. */
export type PublicScope = "search" | "images";

const MINUTE_MS = 60 * 1000;

/**
 * Every number a public read route is throttled by, in one table.
 *
 * One layer, not three, and that is the difference from `AUTH_LIMITS`: those bound a *credential* attack, so
 * they key on the account and add a platform ceiling on top. Nothing here is being guessed. These two routes
 * are public reads with no account in the picture, so the only question is how much work one caller may ask
 * the origin to do.
 *
 * Neither number is reached by a real browser, and the reasoning is worth writing down because they look
 * arbitrary otherwise:
 *
 * - **search** fires on a 300ms debounce (src/components/SearchInput.tsx), so the most a single person can
 *   produce is one query per pause — a key-by-key typist pausing between every character reaches roughly 200
 *   a minute. 600 leaves room for three of those at once, and a caller still cannot get more than 10 queries
 *   a second out of the origin. With the trigram index that came in with this fix, each query is cheap;
 *   without it, these queries were four sequential scans apiece, which is why the limit and the index are
 *   the same finding.
 * - **images** is the more delicate one, because image requests *are* bursty by nature — one page load can
 *   ask for dozens. What makes a loose number safe here is that the route serves `Cache-Control: immutable`,
 *   so a browser fetches a given ref exactly once and never asks again. A real client's requests are
 *   therefore spread across first visits, not repeated. 1200 a minute bounds a hammering caller to 20
 *   `sharp` operations a second while leaving a shared carrier address far more headroom than its first
 *   visits need.
 *
 * Both are deliberately loose for the same reason the auth caller limits are: on a Nigerian mobile network
 * most traffic arrives from a handful of carrier-grade NAT addresses, so a tight per-address limit would
 * take a whole carrier's users down to inconvenience one attacker. These bound throughput; they do not try
 * to identify anyone.
 *
 * There is deliberately no platform-wide ceiling here, unlike `AUTH_LIMITS`. A global cap on public reads
 * would fail on a genuinely busy day, which is an availability risk rather than a security control — and
 * unlike a login flood, a flood of searches and image requests is not itself an attack signature.
 */
export const PUBLIC_LIMITS: Record<PublicScope, Limit> = {
  search: { max: 600, windowMs: MINUTE_MS },
  images: { max: 1200, windowMs: MINUTE_MS },
};

/**
 * Check a public read caller against its limit, and count the request if it is allowed through.
 *
 * One call rather than a separate check and record, because the two are never wanted apart here: every
 * request these routes accept costs the origin work, so every one counts — the opposite of the auth routes,
 * where only failures do and a route has to be trusted to decide which. A refused request is not recorded,
 * so a caller over the line does not extend its own block by retrying.
 */
export async function throttlePublicRequest(
  scope: PublicScope,
  request: Request
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const key = `public-ip:${scope}:${getClientIp(request)}`;
  const check = await isRateLimited(key, PUBLIC_LIMITS[scope]);
  if (!check.limited) await recordAttempt(key);
  return check;
}

export async function isRateLimited(
  key: string,
  { max, windowMs }: { max: number; windowMs: number }
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const windowStart = new Date(Date.now() - windowMs);

  // Opportunistic cleanup for this key, so a key in steady use doesn't accumulate a row per request for
  // as long as it is used. This is *not* what keeps the table bounded — it only ever touches the key it
  // was asked about, and `purgeExpiredAttempts` below is what handles the rest.
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

// ---------------------------------------------------------------------------
// Keeping the attempts table bounded (finding #14)
// ---------------------------------------------------------------------------

/**
 * How long a rate-limit row is kept before the sweep may delete it.
 *
 * A row is dead once it is older than the window of every limit that could look at its key: `isRateLimited`
 * counts only rows newer than the window it is called with, and `retryAfterSeconds` reads the oldest row
 * *inside* that window, so nothing outside it is ever consulted.
 *
 * The longest window in the codebase is 24 hours — the community-create limit in
 * src/app/api/communities/route.ts, the only one longer than an hour — and this is twice that. Deleting a
 * row too early is the one mistake here that is a security regression rather than a cost: it would make a
 * limit looser than the number it advertises, silently. The margin is the whole defence, so **if you
 * lengthen a window past 48 hours, lengthen this with it** — there is no table to derive it from, because
 * the windows live in the thirty route files that use them.
 */
export const ATTEMPT_RETENTION_MS = 48 * 60 * 60 * 1000;

/** Rows removed per statement, and the ceiling on one sweep run. */
export const PURGE_BATCH_SIZE = 5_000;
export const PURGE_MAX_PER_RUN = 50_000;

/**
 * Deletes rate-limit rows that can no longer affect any decision. Returns how many went.
 *
 * Finding #14: this used to be nobody's job. `isRateLimited` clears the key it was asked about, so a key
 * that is never asked about again kept its rows forever — and the keys are built from request bodies and
 * headers, so it is a caller who decides how many there are. On the unauthenticated routes that is an
 * attacker's choice, and an unbounded table on the database every other request shares is a slow way to
 * take the site down.
 *
 * Bounded per run on purpose. The sweep runs every two minutes and whatever it doesn't reach is picked up
 * by the next one, so a table somebody deliberately grew cannot turn a single run into one long
 * transaction holding locks — and, since the same sweep is what expires Battles and approves payouts, the
 * one run it could stall is the one with money on it.
 *
 * `batchSize`/`maxPerRun` are injectable so the bounding can be tested without seeding fifty thousand
 * rows; production never passes them.
 */
export async function purgeExpiredAttempts(
  now: Date = new Date(),
  { batchSize = PURGE_BATCH_SIZE, maxPerRun = PURGE_MAX_PER_RUN }: { batchSize?: number; maxPerRun?: number } = {}
): Promise<number> {
  const cutoff = new Date(now.getTime() - ATTEMPT_RETENTION_MS);
  let deleted = 0;

  while (deleted < maxPerRun) {
    const { count } = await prisma.rateLimitAttempt.deleteMany({
      where: { createdAt: { lt: cutoff } },
      limit: Math.min(batchSize, maxPerRun - deleted),
    });
    deleted += count;
    // A short batch means the range is exhausted — the only way to know, since `limit` gives no total.
    if (count < batchSize) break;
  }

  return deleted;
}
