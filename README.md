# Circuit

Tournament and 1v1 Battle platform for Nigeria-first esports organizers.
V1 build — see the companion docs for the "why" and "what" before touching
the "how" below:

- [Circuit Strategy](https://claude.ai/code/artifact/c31a90db-7742-4492-90a7-47be71c05daf) — positioning, audience, business model (also mirrored as text at [`docs/circuit-strategy.md`](docs/circuit-strategy.md), so a local session can read it without fetching a URL)
- [Circuit PRD](https://claude.ai/code/artifact/f568d35d-e93e-4205-9242-6a70c3a99d90) — V1 requirements, data model, release criteria
- [Circuit Build Plan](https://claude.ai/code/artifact/a4a8a76e-68a5-4d50-b710-cda50106af8b) — task-by-task build order with dependencies
- [`docs/circuit-ui-references.md`](docs/circuit-ui-references.md) — six verified, live UI references (desktop + mobile) combined into Circuit's design system direction

## Stack

Next.js (App Router) + TypeScript + Tailwind, Prisma + PostgreSQL, Paystack
and Flutterwave for payments. One full-stack codebase — see the PRD's D5 and
NFR-3 for why both payment rails exist and why raw card/bank data never
touches this app directly.

Everything beyond the app framework itself — hosting, file storage,
scheduled work, push/email, rate limiting, observability — is decided in
[`docs/circuit-stack.md`](docs/circuit-stack.md), each choice tied back to
the specific requirement that drove it. Read that before adding a new
dependency; it also names what V1 deliberately does *not* need yet (a job
queue, Redis, a WebSocket server) so those don't get added speculatively.

## Status

**Phase 0 (Foundations) done. Phases 1 through 4 in progress, plus a
slice of Phase 6 that Phase 3 depends on.** What's here so far, matched
to the Build Plan's task IDs:

| Task | What | File |
|---|---|---|
| P0-1 | Data model | `prisma/schema.prisma` |
| P0-2 | Auth: hashing, sessions, signup/login/logout routes | `src/lib/auth.ts`, `src/lib/session.ts`, `src/app/api/auth/`, `src/app/signup/`, `src/app/login/` |
| P0-3 | Age gate | `src/lib/age-gate.ts` |
| P0-4 | Payment provider abstraction (incl. refundCharge) | `src/lib/payments/` |
| P0-5 | Proof file storage | `src/lib/storage.ts` |
| P0-6 | Notification pipeline | `src/lib/notifications.ts` |
| P0-7 | Payout method field | `prisma/schema.prisma` (`User.payoutMethodRef`) |
| P1-1 | Tournament creation form + API | `src/app/tournaments/new/`, `src/app/api/tournaments/route.ts` |
| P1-2 | Public tournament page | `src/app/tournaments/[id]/page.tsx` |
| P2-1 | Registration flow | `src/app/tournaments/[id]/register/`, `src/app/api/tournaments/[id]/registrations/route.ts` |
| P2-2 | Paid registration & escrow hold | same route (paid branch), `src/lib/payments/confirm.ts`, `src/app/api/webhooks/{paystack,flutterwave}/` |
| P2-3 | Registration auto-close | enforced live at write time, plus the deadline path in the sweep (P3-6) |
| P2-4 | Withdrawal & refund | `src/app/api/registrations/[id]/withdraw/route.ts` |
| P2-5 | Cancellation refund fan-out | `src/app/api/tournaments/[id]/cancel/route.ts` |
| P3-1..P3-3 | Match/Bracket entities, bracket generation, match codes | `src/lib/matches.ts` (`generateBracket`) |
| P3-4 | Result submission & proof upload | `src/app/api/matches/[id]/results/route.ts`, `src/app/matches/[id]/` |
| P3-5 | Auto-complete on matching reports | `src/lib/matches.ts` (`resolveAfterSubmission`, `completeMatch`) |
| P3-6 | Silent-side auto-accept + dispute-escalation timeout | `src/lib/matches.ts` (`runScheduledSweep`), `src/app/api/cron/sweep/route.ts` — not wired to an actual scheduler yet |
| P3-7 | Dispute creation on conflict | `src/lib/matches.ts` (`openDispute`) |
| P3-8 | Organizer ruling & staff escalation | `src/app/api/disputes/[id]/rule/route.ts`, `src/lib/matches.ts` (`ruleDispute`) |
| P3-9 | Live bracket view (polling) | `src/app/tournaments/[id]/bracket/` |
| P6-1 | Staff dispute queue | `src/app/staff/disputes/page.tsx` |
| P6-2 | Staff ruling | `src/app/api/staff/disputes/[id]/rule/route.ts` — void restricted to Battles only, see gaps below |
| P4-1 | Battle entity & creation | `src/app/battles/new/`, `src/app/api/battles/route.ts` |
| P4-2 | Open Battle board | `src/app/battles/page.tsx` |
| P4-3 | Targeted challenge notification | same route — `notify(..., "BATTLE_CHALLENGE", ...)` |
| P4-4 | Accept → attach to Match/Dispute engine | `src/app/api/battles/[id]/accept/route.ts`, `src/lib/matches.ts` (`createBattleMatch`) — no new match/dispute/proof code, the Phase 3 engine handles it as-is |
| P4-5 | Ranked ladder | `src/app/ladder/` |
| P4-6 | Cancel open Battle | `src/app/api/battles/[id]/cancel/route.ts` |
| P1-4 | Discovery — homepage rebuilt as a sectioned feed (Live Now / Starting Soon / Registration Open / Recently Finished / Open Battles), filterable by game, not a separate route | `src/app/page.tsx` |
| P1-3 | Tournament edit + field locking (entryFee/prizeAmount lock once a paid registration exists) | `src/app/tournaments/[id]/edit/`, `src/app/api/tournaments/[id]/route.ts` |
| P0-7/ACC-6 | Account settings (display name, avatar, DOB, payout method ref) | `src/app/account/`, `src/app/api/account/route.ts` |
| P3-10/ACC-6 | Public player profile + match history (tournament + Battle) | `src/app/players/[handle]/page.tsx` |
| P2-6 | Prize payout release, age-gated | `src/app/api/tournaments/[id]/payout/route.ts` — "final match clears its dispute window" is just `Tournament.status === COMPLETE`, see that route's own comment |
| — | **ACC-3's age gate is now actually wired up** — it existed since Phase 0 but nothing ever called it. Now gates paid registration and prize payout claim; never free registration or browsing (TRU-5) |

Also added, not in the original Build Plan: a lightweight `streamUrl`
field on Tournament and Battle (link only, no embed, no live-status
check — the PRD's actual "streaming build-out" is documented V2 scope,
this is not that). Shown as a "📺 Watch stream" link on the tournament/
Battle page and a 📺 badge on homepage cards.

Not yet built: P2-7 (registrant/payment status view — feeds the Phase 5
dashboard), P6-3/P6-4 (abuse reporting, account suspension — P1), Phase 5
(Organizer Dashboard), Phase 8 (NFR/analytics — needs real Sentry/PostHog
keys this environment doesn't have).

**Known gaps, called out rather than silently dropped** (see the relevant
file's own comment for each):
- Login has no rate-limiting yet (ACC-5).
- The registration cap check has a narrow race under concurrent requests at
  the last open slot (not worth a row lock at V1's expected concurrency).
- Withdrawing a still-processing (PENDING_PAYMENT) registration can miss a
  refund if the charge actually completes moments later — needs a
  reconciliation job V1 doesn't have.
- **Voiding a tournament bracket match is refused, not implemented** — PRD
  §19 flags this as an open product question (replay? split the round?
  organizer's call?) for both free and paid matches. Staff can only void a
  Battle (no stake, nothing to return); a bracket match dispute must be
  resolved with a winner until someone signs off on an answer.
- No self-serve way to grant `User.isStaff` yet — it's a direct DB write.
- Bracket generation has a narrow, unlikely-in-practice race if two
  triggers (cap-fill and the deadline sweep) fire for the same tournament
  at the same instant — see `generateBracket`'s own comment.
- The sweep endpoint (`/api/cron/sweep`) exists and is secret-protected but
  isn't hooked up to an actual scheduler — there's no deployment target
  for Vercel Cron yet.

## Setup

```bash
cd ~/Dev/circuit

cp .env.example .env
# Edit .env: at minimum set JWT_SECRET (openssl rand -base64 32) and
# DATABASE_URL, pointing at a real Postgres instance. Payment keys can wait
# until Phase 2 work starts.

npx prisma generate
npx prisma migrate dev --name init   # needs DATABASE_URL pointing at a real Postgres

npm run dev
```

Open http://localhost:3000 — sign up, then create a tournament to get a
shareable public page at `/tournaments/[id]`.

## Conventions worth knowing before adding to this

- **Money is always minor units (kobo), always `Int`, never a float.**
  `Tournament.entryFee`, `EscrowTransaction.amount`, everything in
  `src/lib/payments/types.ts` — all kobo.
- **A `Match` belongs to a `Tournament`+`Bracket` OR a `Battle`, never
  both.** This is the reuse the Strategy doc and PRD both call out
  explicitly — see the Build Plan's Phase 3 callout. Don't build Battles a
  separate reporting/dispute path; it attaches to the same `Match` and
  `Dispute` models with `tournamentId` left null.
- **`src/lib/payments` is the only payments import Phase 2 code should
  use.** Never import `paystack.ts` or `flutterwave.ts` directly from
  outside that folder — go through `getPaymentProvider()` /
  `getDefaultPaymentProvider()` in `index.ts`.
- **`assertAgeGate()` goes on cash-touching actions only** — paid
  registration, payout claim. Never on a browsing or discovery route (see
  TRU-5 in the PRD).
- **Design tokens live in `src/app/globals.css`, not scattered Tailwind
  colors.** Use `bg-surface`/`text-muted`/`border-border`/`bg-brand`/etc.,
  never `zinc-*` or `black/white` opacity classes — see
  `docs/circuit-ui-references.md` for where each pattern came from.
  Shared primitives: `.field-input`/`.field-label`/`.btn-primary`/
  `.btn-secondary`/`.btn-danger`/`.card` (global CSS classes) and
  `<StatusPill>`/`<OptionCard>`/`<LiveCounter>` (`src/components/`). Mobile
  nav is `BottomTabBar` (`sm:hidden`), not a squeezed copy of
  `SiteHeader`'s desktop nav — reflow into it, don't add a third nav.
