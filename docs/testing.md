# Circuit — Testing

Vitest for unit and integration tests (`npm test`), matching
`docs/circuit-stack.md`'s own commitment. Playwright (`npm run test:e2e`)
covers the flows Vitest structurally can't reach (see "Deliberately not
yet covered" below): register → pay → escrow hold, result-submit →
auto-complete → payout-eligible, and Quick Match's first-accept-wins race
through the real UI.

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

## Running e2e tests

```bash
npm run test:e2e       # runs the whole e2e suite headless
npm run test:e2e:ui    # Playwright's own UI mode, for debugging locally
```

- **Locally**: drives a real Chromium browser against `npm run dev`
  (`playwright.config.ts`'s `webServer`, reused if you already have
  `npm run dev` running — same `DATABASE_URL` discipline as Vitest
  above). Next dev mode (Turbopack) compiles each route/API handler on
  its first real hit rather than ahead of time, so the first run against
  a route these tests haven't touched yet in the current dev-server
  process can itself take several real seconds before the assertion
  under test even starts — the config's `timeout: 90_000` and this
  suite's individual `waitForURL`/`waitForResponse` calls are sized for
  that, not for a slow test.
- **In CI**: `.github/workflows/ci.yml` runs this suite too, after
  `npm run build` — `playwright.config.ts` detects `CI` and points
  `webServer` at `npm run start` (a real production server) instead of
  `npm run dev`, which sidesteps the dev-mode cold-compile timing above
  entirely and is what actually caught two real bugs before they shipped
  (see the Quick Match feature's own commit history): `next start`
  silently doesn't work correctly under this project's old
  `output: "standalone"` config (removed from `next.config.ts` once this
  was discovered), and a global UI listener could render a second,
  redundant control on top of a page that already had its own — both
  invisible against `next dev`'s slower, more forgiving timing, both
  real under production speed. `retries: 1` in CI (0 locally) absorbs
  genuine transient flakiness (a slow runner, a momentary hiccup against
  the job's own ephemeral Postgres service) without masking a
  consistently-failing test. Playwright's Chromium download is cached
  across runs (`actions/cache`, keyed on the pinned `@playwright/test`
  version) rather than re-downloaded every time.

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
- `playwright.config.ts` — config. `fullyParallel: false`/`workers: 1`
  for the same reason as Vitest's `fileParallelism: false`: these tests
  hit the same real dev Postgres the app itself uses, not an isolated
  per-worker database.
- `e2e/helpers.ts` — `createE2EUser()` (wraps `src/testHelpers.ts`'s
  `createTestUser` with a real `passwordHash` and an 18+ `dateOfBirth`,
  both required for the cash-touching flows these tests exercise) and
  `loginViaUI()` (drives the real `/login` form). Fixture scaffolding
  (users, tournaments, Battles, matches) goes through direct Prisma
  writes, same `TEST-`-prefix + `cleanupAll()` discipline as Vitest —
  only the actual flow under test drives the real browser.
- `e2e/*.spec.ts` — one file per flow, Playwright's own convention.

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
- `src/lib/quickMatch.test.ts` — Quick Match's "first accept wins" design:
  the standalone status compare-and-swap under several concurrent
  attempts, `resolveQuickMatchAcceptance`'s full accept transaction under
  concurrent full-accept attempts (money invariants: exactly one accepter
  debited, the other pending recipients cancelled untouched), expiry
  correctly blocking a late accept without depending on a sweep having
  run, `expireQuickMatchChallengeIfDue`/`cancelQuickMatchChallenge`'s
  refund-in-one-transaction shape (and idempotency — a second call must
  not double-refund), the insufficient-balance-at-accept recovery path
  reopening the challenge without touching the host's still-locked stake,
  and `getEligibleRecipients`'s exclusions (self, suspended, offline,
  can't-afford-the-stake, already in an active match).
- `e2e/registration-wallet-pay.spec.ts` — register → pay → escrow hold,
  through the real `/tournaments/[id]/register` form: the wallet-pay
  radio (the one entry-fee path that needs no external payment-provider
  credentials, since `PAYSTACK_SECRET_KEY`/`FLUTTERWAVE_SECRET_KEY` are
  unset here), asserting `Registration.status`, the wallet-balance
  debit, and the `ENTRY_FEE` escrow row this flow's own name promises.
  Also covers the card-radio fallback when the wallet can't cover the
  fee.
- `e2e/match-result-payout.spec.ts` — result-submit → auto-complete →
  payout-eligible, through the real `/matches/[id]` result form (two
  browser contexts, one per player, including a real proof-file
  upload): a staked Battle rather than a tournament bracket final, since
  a Battle's winner is paid automatically the instant both results
  agree (no real payment-provider transfer or bracket generation
  needed) — asserting `Match.status`, the winner's wallet-balance
  credit, and the `STAKE_PAYOUT` escrow row.
- `e2e/quick-match.spec.ts` — the same "first accept wins" race
  `src/lib/quickMatch.test.ts` proves at the library level, this time
  through the real `/battles/new` → Quick Match form and the real
  `/quick-match/[id]` accept page (two recipient browser contexts race a
  real accept click), confirming the guarantee holds through the actual
  API routes and UI, not just the underlying transaction logic.

Deliberately not yet covered: most individual API route handlers.
Several (auth-gated ones especially) call `next/headers`'s `cookies()`
internally, which needs a real Next.js request context to work — calling
an exported route handler directly from a plain Vitest test throws
outside that context. That's exactly the gap `e2e/` fills for the two
flows that most need it; the lib-level functions those routes call into
(which is where the actual business logic and the bugs this suite was
built to catch mostly live) are what's tested at the Vitest layer
instead. A tournament's "Claim prize" payout path (as opposed to a
Battle's automatic one) still isn't covered end-to-end — it needs a full
single-round bracket plus a `payoutMethodRef`, and its own route calls
the real payment provider's transfer API, which this environment has no
credentials for.
