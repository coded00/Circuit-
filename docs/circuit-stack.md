# Circuit — Tech Stack

The application-layer stack (Next.js, TypeScript, Prisma/Postgres, Paystack/
Flutterwave) was decided and scaffolded already — see the README's Status
table. This doc is the rest of it: every other piece Circuit needs to
actually run in production, decided against the same PRD/Build Plan
requirements rather than picked generically. Where a choice isn't obvious,
that's said plainly, the same way the PRD's Assumptions & Key Decisions
(§05) flags things worth revisiting rather than presenting them as settled.

Guiding bias throughout: **V1 runs on as few moving parts as Postgres and
Next.js can reasonably cover.** Every extra service below is added only
where a requirement genuinely can't be met without it — matching the Build
Plan's own restraint ("don't build streaming infrastructure from day one").
A service listed as "not yet" is a real recommendation, not a gap.

## Application layer

| Piece | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router), TypeScript | Server-rendered pages matter for NFR-1 (usable on 3G / mid-range Android) — a guest gets real content on first paint, not a JS bundle to hydrate first. One codebase for frontend + API routes, which matters for a small team building V1 alone. |
| Styling | Tailwind CSS | Already scaffolded by `create-next-app`; no reason to add a second styling system. |
| Database | PostgreSQL | The PRD's data model (§14) is relentlessly relational — Tournament → Registration → Bracket → Match → Dispute, EscrowTransaction tied to both a Tournament and optionally a Registration. Payment confirming and registration flipping to CONFIRMED need to happen atomically; that's what a relational DB with real transactions is for. |
| ORM | Prisma | `prisma/schema.prisma` already maps close to 1:1 with the PRD's conceptual entities; migrations keep schema and DB in sync as later phases add fields. |
| Auth | Custom (bcryptjs + jose), already in `src/lib/auth.ts` | ACC-2's signup is deliberately thin (email/phone + password, no OAuth-provider baggage required); rolling this ourselves keeps full control over the session shape rather than fighting a framework's assumptions about what a "user" looks like. |
| Payments | Paystack + Flutterwave REST clients, already in `src/lib/payments/` | D5. Hosted/tokenized checkout only — Circuit's servers never see card or bank details (NFR-3). |

## Hosting & database provider

**Vercel (app) + Neon (Postgres), as the default.** Vercel is close to
zero-config for Next.js and has a genuinely usable free tier for a
pre-revenue V1. Neon is Postgres built for serverless — its pooled
connection string is what keeps Prisma from exhausting connections under
Vercel's concurrent function invocations, which is the one sharp edge of
this pairing if you reach for a plain Postgres box instead.

**Railway, as the alternative worth knowing about.** A single always-on
container instead of serverless functions — simpler mental model, a
persistent disk if you ever want it, flat predictable pricing, no
connection-pooling gotcha to learn. Worth switching to if the serverless
model ever feels like it's fighting you; not worth the ops overhead over
Vercel/Neon on day one.

Either way: **don't self-host Postgres for V1.** Backups, failover, and
point-in-time recovery on money-holding data are not where a two-person
team's time is well spent this early.

## File storage (proof uploads)

`src/lib/storage.ts` already separates the storage interface from its
implementation on purpose — `LocalProofStorage` (local disk) is for
development only. **This is not optional to swap before launch if hosting
on Vercel**: serverless functions have an ephemeral, non-shared filesystem,
so a screenshot written to disk by one function invocation may not exist
for the next one that tries to read it. Before Phase 3's proof upload
(BRK-3) goes live, that interface needs an S3-compatible implementation.

**Cloudflare R2, recommended.** S3-compatible API (so the swap is small),
and — the specific reason it beats plain AWS S3 here — no egress fees.
Proof clips are exactly the kind of media that gets re-read repeatedly
during a dispute review; paying per-GB every time staff reviews evidence is
a real, avoidable cost at scale.

## Scheduled work (auto-accept, dispute windows, registration close)

Three things in the PRD have a clock attached, not just a trigger: BRK-10's
silent-side auto-accept (2h), BRK-5's dispute window (24h), and REG-3's
registration close at a deadline (as opposed to hitting the cap, which is
event-driven and needs no clock). All three are the same shape: "this row
becomes actionable once `some_timestamp` has passed."

**Recommendation for V1: no separate job queue.** A single scheduled route,
hit every few minutes by Vercel Cron (or any external cron ping), that
queries Postgres for matches past `reportWindowExpiresAt`, disputes past
their ruling window, and tournaments past `registrationCloseAt` — then
resolves each. This is already exactly what the `Match.reportWindowExpiresAt`
field in the schema was built for. It's not real-time to the second, but
nothing in the PRD asks for second-level precision here, and it adds zero
new infrastructure.

**Revisit only if:** match volume gets high enough that a single sweep
query becomes slow, or a feature genuinely needs sub-minute precision.
Inngest or Upstash QStash (both built for exactly this, both play well with
serverless) are the natural upgrade — not Redis-backed queues like BullMQ,
which assume a long-running worker process this stack doesn't have.

## Live-ish updates (bracket view, match status)

BRK-7 wants the bracket view updating as matches complete. **Polling for
V1** — a short-interval revalidation (SWR or React Query) on the bracket
and match pages, not a persistent WebSocket connection. This is a
deliberate call, not a shortcut: a WebSocket held open on the 3G Android
connection NFR-1 targets is its own reliability problem, and polling every
few seconds is imperceptibly different from "live" for a bracket that
updates a handful of times over a tournament's lifetime.

**Revisit if:** Battles' open board (BTL-2) or live match counts need to
feel more instantaneous than polling delivers. Ably or Pusher are the
natural additions then — both handle the reconnection/scaling complexity a
hand-rolled WebSocket server would otherwise cost real time to get right.

## Notifications

The in-app channel (P0-6, `src/lib/notifications.ts`) is already built and
needs nothing further. Two channels remain, both P1/fallback per NOT-3, not
launch-blocking:

- **Push**: OneSignal, recommended for V1 — a generous free tier and it
  absorbs the real complexity of cross-browser Web Push (VAPID keys,
  subscription lifecycle, Safari's different model) that's easy to
  underestimate building by hand. The no-third-party alternative is the
  `web-push` npm package directly; worth it only if avoiding an external
  dependency matters more than the time it costs to build.
- **Email fallback**: Resend — clean API, generous free tier, standard
  choice for transactional email from a Next.js app.
- **SMS fallback**: explicitly deferred, not decided. NOT-3 already frames
  SMS as a fallback of a fallback; Termii and Africa's Talking are the two
  Nigeria-relevant providers worth comparing if this ever becomes worth
  building, but there's no reason to pick one before it's needed.

## Rate limiting (ACC-5)

**Postgres, not Redis, for V1.** ACC-5 requires rate-limited login
attempts; the naive read is "that means Redis," but a small table tracking
attempts per identifier with a timestamp, queried on each login attempt,
does the same job at V1's actual traffic without standing up a new service.
Upstash Redis (serverless, pay-per-request, so it doesn't violate the
"minimize moving parts" bias either) is the right upgrade if login volume
ever makes that query path a real cost — not before.

## Request validation

**zod for new routes only — existing routes are not being retrofitted.**
The ~45 existing API routes all do manual inline validation (`typeof`
checks, trimming, hand-written error messages) and it works correctly;
rewriting all of them for consistency's sake would be a large, purely
mechanical change with real regression risk against routes that aren't
broken. Instead: any *new* route from here on validates its input with
zod (parse the request body against a schema, return the first issue's
message on failure) instead of hand-rolling the same checks again. The
two styles will coexist in the codebase indefinitely — that's an accepted
tradeoff, not a TODO to "finish migrating" later.

## Observability

- **Errors: Sentry.** Non-negotiable earlier than most of the above,
  specifically because this app moves real money — an unnoticed error in
  the payment webhook or payout release path is a much worse failure mode
  than an unnoticed UI bug. Generous free tier at V1 scale.
- **Product analytics: PostHog.** The PRD's §17 event list
  (`tournament_created` through `match_completed_verified` as the
  north-star event) is product analytics, not web analytics — PostHog's
  event + funnel model matches that directly, and it's usable on the free
  tier at V1 volume.

## Testing & CI

- **Vitest** for unit tests — fast, works cleanly with the existing
  TypeScript setup, no separate config philosophy to learn.
- **Playwright** for end-to-end tests on the flows that most need one:
  register → pay → escrow hold, and result-submit → auto-complete →
  payout-eligible. This environment already has Playwright/Chromium
  preinstalled, which is a convenient coincidence, not a reason on its own
  — the real reason is that these are the two flows where a silent
  regression means real money moving incorrectly.
- **GitHub Actions** for lint + typecheck + test on every PR. Free for a
  repo this size, and cheap insurance before anything merges into a
  codebase that touches escrow.

## What V1 explicitly does NOT need yet

Naming these out loud so nobody adds them speculatively:

- A job queue / worker process (BullMQ, Sidekiq-equivalent) — the Postgres
  sweep above covers every V1 scheduled-work need.
- Redis, for rate limiting or caching — Postgres covers V1 volume.
- A WebSocket server — polling covers BRK-7 at V1 scale.
- A native mobile app or a separate backend API — V1 is a webapp per your
  own scoping call; nothing here should be built as if a native client is
  coming next.
- Kubernetes, or any container orchestration — Vercel/Railway are
  managed platforms for exactly this reason.

## Open items worth revisiting

- **Hosting region latency for Nigeria.** Neither Vercel's nor Railway's
  compute regions include West Africa directly. This is normal for most
  modern hosting and Next.js's server-rendering plus Cloudflare-fronted
  static assets absorb most of the pain, but it's worth an actual latency
  check from Lagos once there's a staging deploy, not just an assumption.
- **OneSignal vs. rolling push by hand** is a real trade worth revisiting
  once Phase 7 (Notifications wiring) actually starts — this doc picks a
  default, not a final answer.
- **R2 vs. S3 pricing** at real scale is worth re-checking against actual
  proof-upload volume once there's usage data — the "no egress fee" case
  for R2 gets stronger the more staff re-review evidence, so it should be
  cheap either way at V1's expected volume, but "should be" isn't "is."
