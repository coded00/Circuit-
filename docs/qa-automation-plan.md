# Circuit: QA automation plan

Status: plan only, nothing here is built yet. Written 2026-09-30.
Owner: to be decided (see "Decisions needed").

This plan builds on what already exists. It does not replace it.

## 1. Where we are today

| Layer | What exists | Honest gaps |
|---|---|---|
| Static checks | `tsc`, ESLint (incl. React purity rules), Prisma validate | No migration-drift check, no secret scan, no dependency audit |
| Unit and DB integration | Vitest, about 34 files, real Postgres, `TEST-` fixtures, sequential files | Slow (4 to 6 minutes against Neon), runs against the shared dev DB locally, most of the 144 API routes never called directly |
| End to end | Playwright, 3 flows (wallet entry fee, result to payout, quick match), Chromium only | No league, bracket, team, refund, cancel, dispute or admin journeys; no mobile project |
| CI | GitHub Actions: typecheck, lint, tests, build, e2e on every push and PR | No nightly jobs, no sharding, no reports beyond the log |
| Payments | Stubbed provider calls, webhook signature tests | No replay of real Paystack payloads, no sandbox smoke test |
| Non-functional | Nothing | No accessibility, visual, performance, load or security automation; the 3G/Lighthouse target (NFR-1) is open |
| Production | Sentry/PostHog not wired (Phase 8) | No synthetic checks, no daily money reconciliation |

### Proof that the gaps matter
Every problem below was found by hand in one day of testing. Each one maps to a check in this plan that would have caught it before a person did.

| Found by hand | Would have been caught by |
|---|---|
| Header wallet balance stale after a top-up | E2E journey "fund wallet" asserting the header chip |
| Refund of a wallet-paid entry sent to Paystack, which had never seen it | DB integration test plus provider fixture |
| Organizer paid for entries that had been refunded | Ledger invariant checks (section 6) |
| Re-entered player could not withdraw again | State-machine integration test (register, withdraw, re-register, withdraw) |
| Duplicate React keys in the bank dropdown | "Fail any E2E test on a console error" rule |
| Vague "something went wrong" on payout failure | API contract test for provider failure paths |
| Test helper could not delete a tournament with a bracket | The same tests, run more often |
| Paystack test mode allows 3 real bank lookups a day | Sandbox smoke test designed around that limit |

## 2. Principles

1. **Test by risk, not by line count.** Money, results and brackets first. A 100% line coverage number is not a goal.
2. **Invariants over examples.** For money, assert things that must always be true (ledger adds up) in addition to specific cases.
3. **Real database, fake internet.** Keep the real Postgres (that is where the race bugs live). Fake only third parties (Paystack, Google, Resend, OneSignal, YouTube).
4. **No sleeps, no shared state, no order dependence.** Every test creates what it needs and cleans up.
5. **A bug fix starts with a failing test.**
6. **Fast feedback on pull requests, depth overnight.** A PR must finish in about 15 minutes; everything heavier runs nightly or before a release.

## 3. The test pyramid for Circuit

```
            few, slow, real browser
          E2E journeys (Playwright)
        API and route tests (real server)
      DB integration and race tests (Vitest)
   Unit and property tests (pure logic)
 Static checks (types, lint, schema, secrets)
            many, fast, cheap
```

### Layer 0: static checks (every commit, about 1 minute)
- `tsc`, ESLint, `prisma validate`.
- **Migration drift:** `prisma migrate diff` from the migrations folder to the schema must be empty, so nobody ships a schema change without a migration.
- **Secret scan** (gitleaks) and `npm audit` for high severity.
- **Forbidden patterns** as lint rules: `Date.now()` inside components (already enforced), em dashes in user-facing strings, raw `fetch` to Paystack outside the payments module.

### Layer 1: unit and property tests (every commit, about 1 minute)
Pure functions only, no database. Already strong for brackets, round robin, Swiss, league, prize splits. Add **property-based tests** (fast-check) for the things that must hold for all inputs:
- Prize shares: the sum of all shares always equals the prize, in kobo, for any split, any number of tied places and any team roster split.
- Platform fee: fee plus organizer share always equals the entry fee for every valid rate.
- Schedules: in a round robin or league, everyone meets everyone exactly once (twice for home and away) and nobody plays twice in a matchday.
- League table: results permuted in any order give the same table.
- Name uniqueness: normalisation is idempotent and case and space insensitive.

### Layer 2: database integration and race tests (every PR, sharded)
State machines, one per domain, written as "walk the whole lifecycle and check every table":
- **Registration:** free, wallet, card; full tournament; withdraw; re-register; name clash at checkout and at confirmation.
- **Money:** fund, enter, withdraw, refund (wallet and card), cancel with mixed payment types, late payment, webhook replay, webhook out of order.
- **Competition engines:** knockout, double elimination, round robin, Swiss, league (draws, double legs, deadlines, awards, deciders), lobby (groups to final).
- **Results and disputes:** agree, disagree, auto-accept, organizer ruling, staff ruling, overdue.
- **Settlement:** organizer revenue after the settlement window, frozen funds, open disputes.
- **Concurrency:** for every money or capacity write, fire N simultaneous requests and assert exactly one wins (pattern already used for the last slot and quick match).

Speed-up (details in section 7): one Postgres per worker schema, so files can run in parallel and the suite drops from about 5 minutes to under 2.

### Layer 3: API and route tests (every PR)
There are 144 route handlers and almost none are called directly, because they need a real Next request context. Run the built server and call routes over HTTP with Playwright's `request` fixture.
- **Authorization matrix, generated from a route table.** For each route: anonymous, normal player, the owner, a different player, organizer, staff, suspended user. Assert 401/403/200 as declared. This is the single cheapest way to catch "anyone can cancel anyone's tournament" bugs.
- **Validation:** wrong types, missing fields, oversized uploads, unicode, negative and fractional kobo.
- **Idempotency:** the same request twice gives one effect (webhooks, claims, withdrawals).
- **Rate limits** actually return 429.
- **Provider failure paths:** Paystack returns 4xx, 5xx, times out, returns malformed JSON. The response must be a clear message and money must be unchanged.

### Layer 4: provider contract tests
- **Recorded fixtures:** we now have real Paystack payloads (charge.success, refund processed, transfer errors). Store them as fixtures and replay them into the webhook route with a correct HMAC signature. This pins the exact field names the code depends on (for example `transaction_reference`).
- **Signature tests** for Paystack and Flutterwave: valid, tampered, missing, replayed.
- **Nightly sandbox smoke** with Paystack test keys: initialize a charge, verify it, refund it, check the webhook arrives through a test tunnel. Designed around known limits: 3 real bank lookups a day in test mode, and transfers blocked until the business is verified (mark those tests `skip until verified`, not deleted).
- **Fakes for everything else:** a small mock OIDC server for Google sign-in, a mail sink for Resend, a no-op OneSignal, canned YouTube responses.

### Layer 5: end to end journeys (Playwright)
Drive real pages. Create data through API helpers, not through the UI, and only drive the flow under test.

**Tier 1, runs on every PR (about 8 journeys, under 8 minutes):**
1. Sign up, log in, log out (email and phone).
2. Fund wallet by card (sandbox or stubbed), header and wallet agree immediately.
3. Enter a paid tournament from wallet; withdraw; balance and notification correct.
4. Enter by card; refund completes; player is told.
5. Organizer creates a tournament of each structure (table-driven).
6. Two players play a match to completion, including proof upload.
7. Dispute: conflicting reports, organizer rules.
8. Register with a taken in-game name: blocked with a clear message.

**Tier 2, runs on merge to main and nightly:**
9. League season: draws, home and away, overdue fixture settled by organizer.
10. Bracket to champion and prize claim (claim skipped until Paystack transfers are enabled).
11. Team: create with player search, share link opens signed out, team entry with prize split, each member notified.
12. Lobby with groups to a final.
13. Cancel a tournament with wallet and card entrants.
14. Admin: suspend user, review report, freeze funds.
15. Community: join, post, mention, react, moderate.

**Cross-cutting rules for every E2E test:**
- **Fail on any browser console error or failed network request** (would have caught the dropdown key bug).
- Run at a desktop and a phone viewport (most players are on Android Chrome). Nightly also runs Firefox and WebKit.
- Use saved login state so tests do not repeat the login form.
- Page objects for the 10 most used screens; no selectors copied between tests.
- Traces, screenshots and video kept on failure only.

### Layer 6: non-functional checks
| Check | Tool | Gate |
|---|---|---|
| Accessibility | axe-core inside Playwright on every page in the journeys, plus keyboard-only tests for forms and dialogs | No serious or critical violations (WCAG AA) |
| Visual regression | Playwright screenshots of about 12 key pages, light and dark, 3 widths, dynamic regions masked | Diff over 0.2% needs a human approval |
| Performance | Lighthouse CI on home, compete, tournament, match, wallet with mobile throttling (the NFR-1 3G target) | LCP under 2.5s, CLS under 0.1, JS budget per route |
| Load | k6: 100 people registering for the last slot, a webhook burst, the sweep over 1,000 tournaments, chat polling | Zero double spends, p95 under 800 ms, sweep under 60 s |
| Security | OWASP ZAP baseline nightly against the preview server, authorization matrix (layer 3), upload type and size checks, header checks | No high findings |
| Resilience | Kill or slow the database and Paystack mid-flow | Clear errors, no lost or duplicated money |
| SEO and sharing | Assert title, description and Open Graph tags on tournament, team and champion pages | Tags present and correct |

### Layer 7: production safety net
- **Post-deploy smoke:** a read-only Playwright run against production with a dedicated test account, plus one sandbox-mode payment if safe.
- **Daily money reconciliation job:** ledger invariants checked against live data and alerts sent on failure (next section).
- **Heartbeat on the sweep:** alert if the scheduled sweep has not run in 10 minutes (nothing closes registration or settles money without it).
- Sentry and PostHog (Phase 8) for errors and funnel drops.

## 4. Money invariants (the most valuable tests we can add)
Run them after every integration test that touches money and daily in production. Each one is a query that must return zero rows.

1. Every user's wallet balance equals the sum of their wallet transactions.
2. Every `COMPLETE` entry fee equals exactly one platform fee plus one organizer share, unless it has been refunded, in which case both must be void.
3. No entry fee has more than one refund row.
4. No `ORGANIZER_REVENUE` is `COMPLETE` for a registration that is `REFUNDED` or `WITHDRAWN`.
5. A tournament's paid-out prizes never exceed its prize amount.
6. Each prize place is claimed at most once per player.
7. Escrow held for a cancelled tournament is zero after refunds settle.
8. The Paystack balance is at least the sum of player wallets plus unclaimed prizes (alert, not fail).

## 5. Test data
- **Factories** (`createTestUser`, `createTestTournament`, and new ones for leagues, teams, games) with the `TEST-` prefix, as today.
- **Seed script for the catalog:** one published game with a mode and format for every structure, so every journey has something to pick.
- **Dedicated test database**, never the shared dev one (section 7).
- **Test accounts** created by script, never by hand, with passwords from CI secrets.
- **Fixed fake cards and webhook fixtures** checked into the repo.

## 6. Making time controllable
Many rules depend on time: registration close, result windows (2 hours), matchday deadlines, settlement (24 hours). Today we fast-forward by editing the database. Replace that with:
- A small `now()` function used by the sweep, settlement and deadline code.
- A test-only endpoint that shifts the clock, disabled unless an environment flag and a secret are present, and refused when `NODE_ENV` is production.
- Tests then say "advance 25 hours, run the sweep" and assert.

## 7. Infrastructure
- **Database:** a Neon branch per CI run (free, instant copy of the schema) or a Postgres container. Local test runs use a separate database, not the dev one. Workers get their own schema so Vitest files can run in parallel.
- **Preview server in CI:** `npm run build` then `next start`, as today.
- **Paystack webhook in CI:** a tunnel for the nightly sandbox job only. PR runs replay fixtures.
- **Secrets:** Paystack test keys, test account passwords, in GitHub secrets.

## 8. Pipeline

| When | What runs | Budget |
|---|---|---|
| Every push and PR | Static checks, unit and property, integration (sharded), API matrix, build, E2E Tier 1 (desktop and phone), axe on touched pages | 15 minutes |
| Merge to main | Everything above plus E2E Tier 2 and visual regression | 30 minutes |
| Nightly | Full browser matrix, Lighthouse, k6, ZAP, Paystack sandbox smoke, mutation testing on money code | 90 minutes |
| Before a release | Full nightly pack, migration rehearsal on a copy of production data, manual exploratory session | As needed |
| After deploy | Production smoke, reconciliation, sweep heartbeat | 5 minutes |

**Flaky tests:** one automatic retry in CI; a test that needs it twice in a week is tagged `@quarantine`, runs but does not block, and gets an owner and a deadline. A weekly report lists flake rate, slowest tests and quarantine count.

**Reporting:** Playwright HTML report and traces as artifacts, JUnit results shown on the pull request, a failure summary in the PR comment, and a Slack message for nightly failures.

## 9. Quality gates
- Every user-facing feature PR has a unit test, an integration test, and an E2E journey or an added step.
- Every money path has an invariant check.
- Every new route is added to the authorization matrix or the build fails.
- Every migration is rehearsed in CI on a clean database and on a copy of data.
- Mutation testing (Stryker) on `lib/payments`, `prizes`, `leagueTable`, `matches` with a target of 70% mutants killed; it shows whether tests actually assert things.

## 10. Rollout

| Phase | Work | Rough effort |
|---|---|---|
| 1. Foundation | Separate test database and per-worker schemas, clock function, catalog seed, Playwright fixtures and saved login, console-error rule, migration-drift and secret checks | 4 to 5 days |
| 2. Money and competition | Ledger invariants, API authorization matrix, Paystack fixtures, E2E Tier 1 | 6 to 8 days |
| 3. Breadth | E2E Tier 2, phone viewport, accessibility, visual regression | 5 to 6 days |
| 4. Depth | Lighthouse budgets, k6 load, ZAP, resilience tests, mutation testing | 5 to 6 days |
| 5. Production | Smoke, reconciliation job, sweep heartbeat, reporting and flake dashboard | 3 to 4 days |

Total: about 4 to 5 weeks of focused work for one engineer. Phases 1 and 2 give most of the protection and are the ones to do before taking real money.

## 11. Known limits
- Paystack transfers (withdrawals, prize payouts) cannot be tested against the real provider until the business is verified. Until then they are covered by stubs and fixtures.
- Real Google sign-in and email delivery cannot be fully automated; they are covered with fakes plus a short manual checklist before each release.
- Automated tests cannot judge whether a screen feels good. Design review stays a human step, backed by the visual baselines and accessibility checks.
- Card payments on Paystack's own checkout page are third-party UI. The sandbox job drives it sparingly; everything else uses API calls and fixtures.

## 12. Decisions needed
1. Who owns triage of failing nightly runs?
2. Is a Neon branch per CI run acceptable (cost and access), or should CI use a Postgres container?
3. Which browsers must be supported? Suggested: Android Chrome and desktop Chrome first, Safari and Firefox nightly.
4. Is a nightly Slack alert wanted, and in which channel?
5. Agree the gates in section 9 before they start blocking merges.
