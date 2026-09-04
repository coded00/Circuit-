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

**Phase 0 (Foundations) done. Phase 1 (Tournament Creation & Discovery) and
Phase 2 (Registration & Payments) both in progress.** What's here so far,
matched to the Build Plan's task IDs:

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
| P2-3 | Registration auto-close | enforced live in the registrations route (no background sweep yet — see Scheduled work in `docs/circuit-stack.md`) |
| P2-4 | Withdrawal & refund | `src/app/api/registrations/[id]/withdraw/route.ts` |
| P2-5 | Cancellation refund fan-out | `src/app/api/tournaments/[id]/cancel/route.ts` |

Not yet built: P1-3 (field locking — same Phase 2 dependency it always
had), P1-4 (discovery list, P2 priority), P2-6 (prize payout — blocked on
Phase 3's dispute-window state, per the Build Plan's own watch-item ①,
don't build it against a stub), P2-7 (registrant/payment status view — P1
priority, feeds the Phase 5 dashboard rather than standing alone).

**Known gaps, called out rather than silently dropped** (see the relevant
route's own comment for each):
- Login has no rate-limiting yet (ACC-5).
- The registration cap check has a narrow race under concurrent requests at
  the last open slot (not worth a row lock at V1's expected concurrency).
- Withdrawing a still-processing (PENDING_PAYMENT) registration can miss a
  refund if the charge actually completes moments later — needs a
  reconciliation job V1 doesn't have.

**Known gap:** ACC-5 requires rate-limited login attempts; `POST
/api/auth/login` doesn't implement that yet. Flagged in that route's own
comment, not silently dropped — see `docs/circuit-stack.md`'s Rate limiting
section for the intended approach (a Postgres attempts table, not Redis).

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
