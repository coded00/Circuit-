# Circuit — Testing

Vitest for unit and integration tests (`npm test`), matching
`docs/circuit-stack.md`'s own commitment. Playwright end-to-end tests for
the two flows that most need one (register → pay → escrow hold, and
result-submit → auto-complete → payout-eligible) are a deliberate
fast-follow, not part of this first pass — see that doc's own reasoning.

## Running tests

```bash
npm test          # runs the whole suite once (what CI runs)
npm run test:watch   # re-runs on file change, for local development
```

Needs a real Postgres reachable via `DATABASE_URL` — most of the suite
is integration tests that hit the real database directly (no mocked
Prisma client), because the bugs this suite exists to catch (the Phase 8
double-spend races, the Phase 9 settlement-orphan bug) only reproduce
against real transaction/locking behavior, not a fake.

- **Locally**: tests use whatever `DATABASE_URL` is already in your
  `.env` — the same database `npm run dev` points at. Every fixture a
  test creates is named with a `TEST-` prefix (`createTestUser`,
  `createTestTournament` in `src/testHelpers.ts`) and cleaned up in an
  `afterEach`, so running the suite against a shared dev database is
  safe — this is the same discipline every throwaway verification script
  in this project's history has used.
- **In CI**: `.github/workflows/ci.yml` spins up an ephemeral
  `postgres:16` service container for the job, runs
  `prisma migrate deploy` against it, then discards it when the job
  ends. Fully isolated from the real Neon dev/prod database — nothing
  in CI can ever write to it.

## Where things live

- `vitest.config.mts` — config. `fileParallelism: false`: several
  integration tests (the settlement sweep especially) query "every
  ready tournament" platform-wide, not just their own fixtures, so two
  test files creating tournaments at the same time could see each
  other's data. Sequential file execution trades some CI speed for that
  not being a source of flaky tests.
- `vitest.setup.ts` — loads `.env` locally via `dotenv` (a no-op in CI,
  since the workflow's own `env:` block already sets everything and
  `dotenv` never overwrites an existing value).
- `src/testHelpers.ts` — shared fixture factories
  (`createTestUser`/`createTestStaff`/`createTestOrganizer`/
  `createTestTournament`) and `cleanupAll()`, which deletes anything
  still tagged `TEST-`. Not matched by the `*.test.ts` glob, so it never
  runs as a test suite itself.
- `src/**/*.test.ts`, colocated with the code they test (e.g.
  `src/lib/matches.test.ts` next to `src/lib/matches.ts`) — Vitest's own
  convention, not a separate `__tests__/` tree.

## What's covered so far

Prioritized by what this codebase's own history shows actually breaks —
concurrency-safety in money-moving code, not broad line coverage:

- `src/lib/matches.test.ts` — completeMatch/ruleDispute's compare-and-
  swap guards (Phase 8): a late submission racing the sweep's
  auto-accept, two concurrent dispute rulings (winner and void
  branches), and the audit-log condition for staff vs. organizer
  rulings.
- `src/lib/settlement.test.ts` — settleOrganizerRevenue (Phase 9):
  multi-row summing, holding revenue during the settlement window / an
  open dispute / a funds freeze, and a late-arriving row being credited
  on a subsequent run rather than silently dropped.
- `src/lib/payments/confirm.test.ts` — confirmEntryFeePayment's replay
  guard (Phase 8): a concurrent webhook + redirect-callback race
  creating the PLATFORM_FEE/ORGANIZER_REVENUE rows exactly once.
  `paystackClient.verifyCharge` is stubbed via `vi.spyOn` — the one
  external dependency a test environment genuinely can't have a real
  credential for; everything downstream is the real production code.
- `src/lib/payments/webhookVerification.test.ts` — Paystack/Flutterwave
  signature verification: correct accept/reject, tampered-payload
  rejection, fail-closed when the secret isn't configured.
- `src/lib/auth.test.ts` — timing-safe password verification (including
  the dummy-hash enumeration-safety path), session token round-trip and
  tamper-rejection, password-reset token hashing.
- `src/lib/platformFee.test.ts` — the fee/organizer-remainder split
  arithmetic invariant (`fee + remainder === entryFee`, for every valid
  rate).
- `src/lib/rateLimit.test.ts` — the Postgres-backed rate limiter's core
  behavior (window expiry, per-key isolation, `clearAttempts`).

Deliberately not yet covered: most individual API route handlers.
Several (auth-gated ones especially) call `next/headers`'s `cookies()`
internally, which needs a real Next.js request context to work — calling
an exported route handler directly from a plain Vitest test throws
outside that context. Testing those end-to-end (real HTTP request, real
cookie) is exactly what the deferred Playwright pass is for; the
lib-level functions those routes call into (which is where the actual
business logic and the bugs this suite was built to catch mostly live)
are what's tested here instead.
