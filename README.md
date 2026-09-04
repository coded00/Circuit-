# Circuit

Tournament and 1v1 Battle platform for Nigeria-first esports organizers.
V1 build — see the companion docs for the "why" and "what" before touching
the "how" below:

- [Circuit Strategy](https://claude.ai/code/artifact/c31a90db-7742-4492-90a7-47be71c05daf) — positioning, audience, business model (also mirrored as text at [`docs/circuit-strategy.md`](docs/circuit-strategy.md), so a local session can read it without fetching a URL)
- [Circuit PRD](https://claude.ai/code/artifact/f568d35d-e93e-4205-9242-6a70c3a99d90) — V1 requirements, data model, release criteria
- [Circuit Build Plan](https://claude.ai/code/artifact/a4a8a76e-68a5-4d50-b710-cda50106af8b) — task-by-task build order with dependencies

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

**Phase 0 (Foundations) in progress.** What's here so far, matched to the
Build Plan's task IDs:

| Task | What | File |
|---|---|---|
| P0-1 | Data model | `prisma/schema.prisma` |
| P0-2 | Password hashing + session tokens | `src/lib/auth.ts` |
| P0-3 | Age gate | `src/lib/age-gate.ts` |
| P0-4 | Payment provider abstraction | `src/lib/payments/` |
| P0-5 | Proof file storage | `src/lib/storage.ts` |
| P0-6 | Notification pipeline | `src/lib/notifications.ts` |
| P0-7 | Payout method field | `prisma/schema.prisma` (`User.payoutMethodRef`) |

Nothing user-facing yet — no routes, no UI beyond what `create-next-app`
scaffolded. That's Phase 1 onward, per the Build Plan.

## Setup

`node_modules` and `.git` were **not** finished through the assistant —
finish both yourself in Terminal, on this machine, not through any bridged
shell. Both `npm install` and `git`'s own commit process need to rename and
delete files as part of normal operation (npm prunes platform-specific
binaries it doesn't need; git writes and atomically replaces objects and
lock files), and a sandboxed bridge blocks exactly that for safety. That's a
permissions boundary, not a bug to route around — plain Terminal has no
such restriction.

```bash
cd ~/Dev/circuit

# --- dependencies: clean slate, the bridged install never finished ---
rm -rf node_modules package-lock.json
npm install

# --- git: the bridge left a stale lock after a blocked cleanup step ---
rm -rf .git
git init
git add -A
git commit -m "Circuit V1: Phase 0 foundations scaffold"

cp .env.example .env
# Then edit .env: at minimum set JWT_SECRET (openssl rand -base64 32) and
# DATABASE_URL. Payment keys can wait until Phase 2 work starts.

npx prisma generate
npx prisma migrate dev --name init   # needs DATABASE_URL pointing at a real Postgres

npm run dev
```

Open http://localhost:3000 — you'll see the default Next.js starter page
until Phase 1 (Tournament Creation & Discovery) replaces it.

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
