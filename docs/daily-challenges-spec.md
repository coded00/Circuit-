# Daily Challenges — implementation spec (phases 1–2, paid pilot)

Status: **draft for approval — nothing built.** Source: the Daily Challenges PRD, adapted to this codebase.

## 1. What it is

A solo, asynchronous, scored competition that lives under **Challenges** (`/battles` today, sidebar item "Challenges").
An admin publishes one for any published game. Players pay an entry fee from their wallet, play one match inside a fixed
window, upload scoreboard evidence and a score. Staff verify. Highest verified score wins; the prize pool pays out.
There is no opponent, bracket or ready-up. Not CODM-specific: the game comes from the catalog, scoring is data.

Naming: UI "Daily Challenges"; code `DailyChallenge*`. Not to be confused with `Battle` (1v1, shown as "Challenges")
or `QuickMatchChallenge`.

## 2. Decisions this spec assumes (change any before approval)

| # | Decision | Why |
|---|---|---|
| D1 | **Extend the existing append-only ledger** (`WalletTransaction` + `EscrowTransaction`, kobo ints, unique `providerRef`, DB triggers). No second double-entry system. | Already enforced and tested (`ledgerAppendOnly.test.ts`); a parallel ledger would be a second source of truth. |
| D2 | **Entry is wallet-only.** Player funds the wallet through the existing FUND flow, then entry debits it. No per-entry card checkout. | Tournaments' card path needs orphaned-charge refunds, superseded references and webhook confirmation (`payments/confirm.ts`, ~335 lines). Wallet entry is one atomic transaction. Card entry can come later. |
| D3 | **Prize = entry-funded pool** (collected fees − platform fee), split by a preset (reuse `prizes.ts`). Optional **sponsor top-up** via a `DailyChallengeSponsorship` row (same pattern as `TournamentSponsorship`). | One model covers paid and sponsored. No guaranteed prize that entries might not cover. |
| D4 | **Prize is credited to the wallet**, not transferred out directly. Withdrawal uses the existing withdraw flow. | Reuses `WithdrawButton`, transfer webhooks, reconciliation. |
| D5 | **Staff create and review.** Admin only for creating, scheduling, reviewing evidence, ruling disputes. | PRD assumption; keeps trust centralized for the pilot. |
| D6 | **Paid is behind a kill switch** (`PlatformSetting.dailyChallengesEnabled`, default off) plus pilot caps (max entry fee, max entrants) set in admin. | The pilot is paid. Regulatory exposure (pay-to-enter, highest-score-wins) is the owner's call; the switch makes it reversible. |
| D7 | **Minimum entrants, prize split and caps** are per-challenge admin fields, with defaults: min entrants 2, split winner-takes-all, cap = platform setting. | Owner hasn't set numbers yet. |

## 3. Data model (Prisma, cuid ids like the rest of the schema)

`DailyChallenge`
- `gameId`, `gameModeId?` (catalog FKs; snapshot `gameName`, `modeName` like Tournament does)
- `title`, `rules` (text: mode/map/settings shown before entry), `evidenceRequirements` (text)
- Scoring: `metricLabel` ("Kills"), `metricUnit?`, `direction` (HIGHER | LOWER), `tiebreakLabel?`, `tiebreakDirection?`, `tiebreakRule` (text, shown up front)
- Money (kobo): `entryFee` (>0 for paid), `maxEntrants`, `minEntrants`, `prizeSplit Int[]`, `platformFeeBps` (snapshot of setting at publish)
- Timeline: `entryOpensAt`, `entryClosesAt`, `windowStartsAt`, `windowEndsAt`, `submissionsCloseAt`, `disputeWindowMinutes`
- `status` — see §4; `pausedAt?`, `cancelledReason?`, `cancelledAt?`, `finalizedAt?`, `settledAt?`
- `createdById`, `createdAt`, `updatedAt`
- Invariant: entry window may extend past `windowStartsAt` only never past `windowEndsAt`; **no entry after the first score is visible** (leaderboard hidden until provisional).

`DailyChallengeEntry` — `challengeId`, `userId`, `inGameName` (snapshot from `UserGameName`), `status` (ENTERED | SUBMITTED | VERIFIED | REJECTED | DISQUALIFIED | WITHDRAWN | REFUNDED), `@@unique([challengeId, userId])`, `createdAt`. Escrow rows hang off it.

`DailyChallengeSubmission` — `entryId` (unique: one scored attempt), `score Int`, `tiebreakScore Int?` (whole numbers; a time is whole seconds or ms, `metricUnit` says which), `verifiedScore Int?`, `evidenceRef` (opaque storage ref, served via `proofResponse.ts`), `evidenceHash` (sha256, **unique across all challenges** for duplicate-evidence detection, with an override path for staff), `evidenceMime`, `submittedAt` (server clock), `status` (PENDING | VERIFIED | REJECTED), `verifiedScore?`, `reviewedById?`, `reviewedAt?`.

`DailyChallengeReview` — append-only audit of every decision: `submissionId`, `reviewerId`, `decision`, `reasonCode`, `note`, `scoreBefore/After`, `createdAt`.

`DailyChallengeDispute` — `submissionId`, `raisedById`, `reason`, `status` (OPEN | UPHELD | DISMISSED), `ruling`, `ruledById`, `ruledAt`. One open per submission. (The existing `Dispute` is tied 1:1 to a `Match`, so it cannot be reused.)

`DailyChallengeSponsorship` — mirrors `TournamentSponsorship` (`amountKobo`, `source`, `note`, `recordedById`).

New enum values (append-only, with a migration the owner runs):
- `EscrowType`: `CHALLENGE_ENTRY`, `CHALLENGE_PLATFORM_FEE`, `CHALLENGE_PRIZE`, `CHALLENGE_REFUND`. Add nullable `dailyChallengeId` + `dailyChallengeEntryId` to `EscrowTransaction` (fill-in-only links, which the append-only trigger already permits).
- `WalletTransactionType`: `CHALLENGE_ENTRY_DEBIT`, `CHALLENGE_ENTRY_REFUND`, `CHALLENGE_PRIZE_CREDIT`.
- `NotificationType`: `DAILY_CHALLENGE_NEW`, `…_ENTERED`, `…_LIVE`, `…_SCORE_VERIFIED`, `…_SCORE_REJECTED`, `…_RESULT`, `…_PRIZE`, `…_CANCELLED`, `…_DISPUTE_RULED`.
- `PlatformSetting`: `dailyChallengesEnabled`, `maxChallengeEntryFeeKobo`, `maxChallengeEntrants`.

## 4. Lifecycle (server-authoritative clocks; the sweep advances it)

```
DRAFT → SCHEDULED → OPEN → LIVE → SUBMISSIONS_CLOSED → UNDER_REVIEW → PROVISIONAL → FINALIZED → SETTLING → COMPLETED
                                  ↘ CANCELLED (from SCHEDULED/OPEN/LIVE/UNDER_REVIEW, refunds all)   PAUSED (any live state, staff only)
```
- "Full" is derived (`entries >= maxEntrants`), not a stored state.
- Time-driven moves run in `runScheduledSweep` (new `src/lib/dailyChallenges.ts`, called from `matches.ts` the same way lobbies are). Each is a compare-and-swap on `status`, so a double sweep is a no-op.
- At `entryClosesAt`/`windowStartsAt`: if entrants < `minEntrants` → cancel + refund everyone.
- UNDER_REVIEW → PROVISIONAL once every submission is VERIFIED or REJECTED and no submission is PENDING. Leaderboard becomes visible here.
- PROVISIONAL → FINALIZED when `disputeWindowMinutes` has passed with no OPEN dispute. An open dispute blocks finalization until ruled.
- Tie-break: primary score, then secondary stat, then the published tiebreak rule; if still level, **prize shares are split between the tied entries** (`prizeShares` already does this for tournaments). Never arbitrary.
- No submission = entry stays ENTERED and cannot rank. Fee is **not** refunded (published rule); this is stated on the entry screen.

## 5. Money flows (all inside one serializable `prisma.$transaction`, 30s default already set in `db.ts`)

**Enter** (`POST /api/daily-challenges/[id]/enter`): gates → `assertAgeGate`, not self-excluded, not suspended, `dailyChallengesEnabled`, status OPEN, cap not reached (row lock like `registrationCapacity.ts`), in-game name exists for the game, fee ≤ platform cap. Then:
1. Entry row. 2. Wallet debit `CHALLENGE_ENTRY_DEBIT` (balance check, same as `lockStake`). 3. Escrow `CHALLENGE_ENTRY` (full fee) + `CHALLENGE_PLATFORM_FEE` (`computePlatformFee`).
4. Counts toward the account-level limits via a shared helper extracted from `stakes.ts` (see §9 open item).

**Withdraw before the window starts**: entry → WITHDRAWN, `CHALLENGE_ENTRY_REFUND` back to wallet. After `windowStartsAt`: no refunds except cancellation.

**Cancel** (staff or auto-min-entrants): every non-REFUNDED entry gets `CHALLENGE_REFUND` + wallet credit; platform fee rows are reversed with compensating rows (never edited).

**Settle** (FINALIZED → SETTLING → COMPLETED): pool = collected − platform fee + sponsor top-up. `plannedShares/prizeShares` produce per-place amounts. Needs **named staff approval** (reuse the separation-of-duties rules from `payoutApproval.ts`: approver can't be a prizewinner or the creator; an auto-approval never releases un-backed money). Then `CHALLENGE_PRIZE` escrow + `CHALLENGE_PRIZE_CREDIT` wallet credit per winner. Idempotent by a per-(challenge, place) unique key.

## 6. Verification pipeline (phase 1: manual, honest)

1. **Bind**: entry stores the in-game name; staff see it next to the evidence.
2. **Collect**: one screenshot (image sniffed with `imageSniff.ts`, pixel-budget bound with `prepareImage.ts`, stored via `storage.ts`, `X-Content-Type-Options`/CSP via `proofResponse.ts`). Optional recording for challenges flagged `requireRecording`.
3. **Integrity**: sha256 uniqueness across all challenges; upload time must be inside `windowStartsAt..submissionsCloseAt`; flag if EXIF/mod date is outside the window (a *signal*, not a verdict).
4. **Review** at `/admin/daily-challenges/[id]/review`: evidence next to claimed score, approve / correct score / reject with a reason code. Every decision → `DailyChallengeReview` + `logAdminAction`.
5. **Lock**: only VERIFIED rank.
Disclosure shown on every challenge: "Results are evidence-reviewed by Circuit, not verified by the game publisher."

## 6b. Requirements: conditions and targets (decided 2026-10-10)

A challenge can carry several requirements besides the ranked score. Two kinds, both checked **by hand** by staff against the evidence:

- **Condition** — pass/fail. "Win the match", "Crossfire only", "AK-47 only". The player ticks that they met it; staff confirm.
- **Target** — a number with a threshold. "At least 10 kills", "at most 600 seconds". `direction` HIGHER = at least the threshold, LOWER = at most. The player reports the number; staff verify it from the evidence.

The **ranked score** is unchanged: exactly one number (`metricLabel`, `direction`) decides the winner, with the optional tie-break stat. Requirements only decide who *qualifies*; they never combine into the score, and weighted formulas and multi-match challenges stay out of scope. A challenge with no requirements behaves exactly as before, so nothing existing needs migrating.

**Rule:** an entry ranks only if staff mark **every** requirement met. Any requirement not met rejects the submission with reason `REQUIREMENT_NOT_MET` and a note naming which one. The fee is not returned for a rejected entry (published up front, like no-submission), unless staff reverse the rejection on a dispute.

Data model:
- `DailyChallengeRequirement` — `challengeId`, `kind` (CONDITION | TARGET), `label`, `unit?`, `direction?` and `threshold Int?` (TARGET only), `sortOrder`. At most 8 per challenge. Locked once published, like every other rule.
- `DailyChallengeRequirementResult` — `submissionId`, `requirementId` (unique together), the player's claim (`claimedMet Boolean?` for a condition, `claimedValue Int?` for a target) and staff's verdict (`met Boolean?`, `verifiedValue Int?`). Staff verdict rows are written only by the review action, which also writes the audit row.

Pure logic (in `dailyChallenges.ts`, unit-tested): `targetMet(direction, threshold, value)`, `parseRequirements` (kind/label/threshold validation, count cap), `parseRequirementClaims` (every requirement answered, targets are whole numbers), `evaluateRequirements(requirements, verdicts)` → `{ qualifies, failed[] }`.

Surfaces: a requirements editor in the admin form; a "to qualify, all of these" list on the player challenge page before entry; on the submission form a checkbox per condition and a number box per target; on the review screen a checklist with the claim beside the evidence and a met / not met choice per line.

## 7. Surfaces

Player (all under Challenges):
- `/battles` gets a **Head-to-head | Daily** switch (existing `SectionTabs`). `/challenges/daily` is the feed; `/challenges/daily/[id]` is the detail page: rules, scoring, fee, pool, cap, all three deadlines, evidence needs, tie-break, refund/dispute policy, then Enter / Submit / Leaderboard.
- Submit form with live deadline countdown; "my entries" list with state.
- Wallet history already reads the ledger — add the new types to its labels.
- Profile: history + best score + wins per game (phase 3).

Admin (new "Daily challenges" item under Operate in `AdminSidebar`, using the existing kit):
- List with status filters; create/edit form (game/mode pickers reuse `loadOrganizerCatalog`); detail page with entries, money summary, pause/cancel (`ConfirmButton`); review queue; disputes tab; settlement + approval; sponsor control; settings (kill switch, caps).

API (mirrors the PRD's logical surface):
`GET /api/daily-challenges`, `GET /api/daily-challenges/[id]`, `POST …/enter`, `POST …/withdraw`, `POST …/submit`, `GET …/leaderboard`, `POST …/disputes`, plus `/api/admin/daily-challenges/**` for create/update/publish/pause/cancel/review/rule/approve.

## 8. Build order (each step shippable, tested, behind the kill switch)

1. Schema + migration (owner runs it) + `dailyChallenges.ts` pure logic (state machine, tie-break, pool maths) with unit tests.
2. Admin: create/schedule/publish, list, pause/cancel; settings.
3. Player feed + detail; **enter/withdraw with money + refund-on-cancel**; tests for atomicity, cap race, double-enter, insufficient balance, self-exclusion.
4. Requirements (conditions and targets, §6b) in the admin form and the player page; submit with evidence storage + duplicate hash and per-requirement claims; admin review queue with the per-requirement checklist.
5. Sweep transitions; provisional leaderboard; disputes; finalize.
6. Settlement + approval + prize credit; notifications; audit coverage.
7. Phase 3 (player record) and phase 4 (XP/streaks/badges) are separate specs.

Verification per step: unit tests, then an end-to-end run against the dev DB (create → enter ×3 → submit → review → finalize → payout; plus min-entrants cancel and a dispute), as done for the admin redesign.

## 9. Open items needing an owner decision before step 3

1. **Do challenge entries count toward `maxLockedStakeKobo` / `maxDailyStakeKobo`?** Recommended yes (one responsible-play budget per account), which means generalizing `lockStake`'s limit check into a shared helper. Alternative: separate limits.
2. **Pilot numbers**: max entry fee, max entrants, minimum entrants default, default split.
3. **Legal/provider sign-off** for pay-to-enter highest-score competitions — outside the code; the kill switch exists so this can be decided at launch, not now.
4. **No-submission policy**: fee forfeited (assumed) vs refunded.
5. **Who covers a shortfall** if the prize split rounds or a refund fails: Circuit (platform) — needs confirming.

## 9b. Step 1 status

Built: schema + migration `20261010100000_daily_challenges` (not applied), `src/lib/dailyChallenges.ts` (state machine, pool maths, ranking/tie-breaks, input validation, entry/withdraw/submit gates) with 47 unit tests. Open items 2, 4 and 5 are running on the spec's defaults (min entrants 2, winner-takes-all, fee forfeited on no submission, Circuit covers shortfalls) until the owner says otherwise.

## 11. Upgrade: categories, house model and the template library (decided 2026-10-11)

Decisions from the owner:

- **House keeps the rest.** Prizes are fixed naira amounts per prize category. After settlement, everything collected and not awarded goes to the house — including the money of a category nobody won, a category replaced by a combined prize, and the whole pool when a mandatory minimum target isn't met by anyone. There is no per-entry platform fee and no separate reserve: the house take is "gross entries − prizes awarded", booked once at settlement as `CHALLENGE_HOUSE_REVENUE`. A challenge cancelled for too few players is a different case and still refunds every fee in full.
- **Weapon is free text.** `weaponLabel` on the challenge; no managed weapon list.
- **Library of 25 templates across 5 games**, each with an on/off toggle (see below).


### Owner's answers, 2026-10-11

Games confirmed (CODM, PUBG Mobile, Free Fire, eFootball, Mobile Legends). Payout cap **70%**. **Toggling a template ON publishes its challenge onto the homepage** (auto-publish on schedule, only if the full configuration passes publish validation). Verification: researched, see below.

### How results are verified — what the research found (2026-10-11)

- No usable official data feed exists for these games. PUBG has a documented API (developer.pubg.com, key required, tournament shard, **14-day retention**, 10 requests/minute) but it is for the main PUBG game and not confirmed for PUBG Mobile; none was found for CODM, Free Fire or Mobile Legends (only unofficial scrapers). So **evidence review is the verification method**, said plainly on every challenge: "checked by Circuit staff from your evidence, not verified by the game's publisher".
- Organizers rely on admin-controlled lobbies and complete recordings, not screenshots alone. Screenshot-OCR tools exist for mobile battle royales but report errors (one reported ~20% of games misread), so OCR may *pre-fill* a form and flag mismatches; **it never decides a prize**.
- Therefore: (1) scoreboard totals (kills, placement, win, goals, assists, possession) → full-screen screenshot, human-confirmed; (2) any category on a weapon, headshot, streak or "Savage" stat → **continuous screen recording required**, and the recording must begin by showing the player's **entry code** (a short code shown only to that entrant on the challenge page) before the game is opened, so old or borrowed footage can't be reused; (3) evidence is hashed, time-stamped by the server and bound to the entry (built); (4) a reviewer cross-checks the stat against the kill feed or scoreboard, with a written reason on every rejection (built); (5) disputes get a second reviewer (step 5).
- The 'recording required' rule is enforced at publish: a prize category that depends on a weapon, headshot or streak stat cannot be published on a challenge without `requireRecording`.

Consequences for the design:

- `noWinnerPolicy` is stored with the challenge before entries open and locked at publish by a database trigger; the owner's choice (`HOUSE_KEEPS`) is the default, `REFUND_ENTRIES` stays available as a policy value.
- **Disclosure:** the challenge page states "if nobody meets the required target, entry fees are not returned" next to the entry button, and entering asks the player to confirm it. A challenge with a mandatory target cannot be published without that text shown.
- **Publish validation:** the worst-case payout (computed with the overlap rules, so a combined prize that replaces two others counts once) must be ≤ the gross entries at the *minimum* number of players × `maxChallengePayoutBps` (+ any sponsor amount) (**70%** — `maxChallengePayoutBps` = 7000 — so the house keeps at least 30% even at the minimum; a sponsor's top-up is allowed on top).
- **Prize categories** (new): name, qualifying rule from a closed set (top N by a metric, best placement, all of several conditions), fixed amount, tie rule, and an optional "replaces" list for combined prizes. Metrics are the existing number-targets with a `rankable` flag; the ranked score is the first metric.
- **Verification rule:** a category that depends on a weapon, headshot or streak stat cannot be published unless the challenge requires a screen recording. Totals the scoreboard shows (kills, placement, win, goals, assists) stay screenshot-checkable. Results are always "reviewed by Circuit staff", never "verified by the publisher".
- **Backward compatible:** a challenge with no categories keeps using its rank split exactly as today.
- **Steps 5–6 (results, settlement) are built on the category model**, not on the single split: unique key per (challenge, category, winner) so a prize cannot be paid twice; reconciliation (entries = awards + house + refunds) before any money moves.

Template library (seeded OFF; toggling ON puts a template in the daily rotation). Defaults: ₦1,000 entry, 20 minimum, 100 maximum players. Prize packs: **A** Podium ₦10,000 / ₦4,000 · **B** Bounty ₦2,000 champion + ₦2,000 top category + ₦10,000 combined (the combined prize replaces the other two for the same player; worst case counted as the plain sum, ₦14,000) · **C** Winner ₦12,000. Every pack stays within the payout cap at 20 players (cap 70% = ₦14,000).

| # | Game | Template | Kind | Ranked by | Must reach / qualify | Pack | Check |
|---|---|---|---|---|---|---|---|
| 1 | CODM | AK-47 Kill Leader | Weapon | AK-47 kills | ≥ 5 AK-47 kills | A | Recording |
| 2 | CODM | Sniper King | Weapon | Sniper kills | ≥ 3 | A | Recording |
| 3 | CODM | Shotgun Mayhem | Weapon | Shotgun kills | ≥ 5 | A | Recording |
| 4 | CODM | Headshot Hunter | Skill | Headshot kills | ≥ 5 | A | Recording |
| 5 | CODM | Battle Royale Champion | Skill | Kills | Win the match | C | Screenshot |
| 6 | CODM | Ultimate Bounty | Combined | Kills | Win + top kills | B | Screenshot |
| 7 | PUBG Mobile | M416 Kill Leader | Weapon | M416 kills | ≥ 5 | A | Recording |
| 8 | PUBG Mobile | AWM Sniper King | Weapon | Sniper kills | ≥ 3 | A | Recording |
| 9 | PUBG Mobile | Chicken Dinner Hunter | Skill | Kills | Win the match | C | Screenshot |
| 10 | PUBG Mobile | Survival Expert | Skill | Best placement | ≥ 3 kills | A | Screenshot |
| 11 | PUBG Mobile | Ultimate Bounty | Combined | Kills | Win + top kills | B | Screenshot |
| 12 | Free Fire | MP40 Rush | Weapon | MP40 kills | ≥ 5 | A | Recording |
| 13 | Free Fire | Booyah Hunter | Skill | Kills | Win the match | C | Screenshot |
| 14 | Free Fire | Headshot Master | Skill | Headshot kills | ≥ 5 | A | Recording |
| 15 | Free Fire | Survival Expert | Skill | Best placement | ≥ 3 kills | A | Screenshot |
| 16 | Free Fire | Booyah Bounty | Combined | Kills | Win + top kills | B | Screenshot |
| 17 | eFootball | Goal Machine | Skill | Goals in one match | ≥ 3 goals | A | Screenshot |
| 18 | eFootball | Clean Sheet King | Skill | Goals | Win without conceding | A | Screenshot |
| 19 | eFootball | Possession Master | Skill | Possession % | Win, ≥ 60% | A | Screenshot |
| 20 | eFootball | Perfect Match | Combined | Goals | Win + ≥ 3 goals + clean sheet | B | Screenshot |
| 21 | Mobile Legends | Kill Leader | Skill | Kills | Win, ≥ 8 kills | A | Screenshot |
| 22 | Mobile Legends | Assist King | Skill | Assists | ≥ 10 | A | Screenshot |
| 23 | Mobile Legends | Savage Hunter | Skill | Kills | Record a Savage | A | Recording |
| 24 | Mobile Legends | MVP Maker | Skill | Kills | Win and be MVP | C | Screenshot |
| 25 | Mobile Legends | Ultimate Bounty | Combined | Kills | Win + MVP + top kills | B | Screenshot |

The four games other than CODM are added to the catalog **unpublished** (publishing is a visible product change for tournaments and battles too); a template can only be launched once its game is published.

## 12. Results, disputes and settlement (built 2026-10-11)

**Lifecycle, end to end.** The sweep carries a challenge: OPEN → LIVE → SUBMISSIONS_CLOSED → UNDER_REVIEW → PROVISIONAL (once no submission is waiting; the dispute window starts) → FINALIZED (window passed, no dispute open) → SETTLING → COMPLETED. Moves that depend on money are not on the clock: settlement runs after the sweep's moves and waits for approval where one is needed.

**Standings.** Hidden until staff verify scores. Shown from PROVISIONAL: an overall board by the ranked score, and one board per prize category (eligible players ranked by that prize's metric, holder marked), plus a combined prize shown as held by whoever won everything it combines. Level entries share a rank (1, 1, 3).

**Disputes.** While provisional and inside the window a player may dispute the decision on their own submission (reason 10–1000 characters; one open per submission, enforced by a partial unique index). A different staff member — not the raiser, not the original reviewer — rules, in writing. UPHELD: the submission returns to PENDING with its verdicts cleared (claim, evidence and review history untouched), the entry to SUBMITTED, the challenge to UNDER_REVIEW with no provisional time, and the next decision has to come from someone other than the first reviewer. DISMISSED: the decision stands. An open dispute blocks finalization however long it takes.

**Settlement** (`challengeSettlement.ts`, over the pure `challengeResults.ts`):
- Awards: one `DailyChallengePrizeAward` per (challenge, category, player) — unique, and append-only at the database (no update, no delete). Each pays through the existing ledger: wallet credit `CHALLENGE_PRIZE_CREDIT` + escrow `CHALLENGE_PRIZE`, each with a unique reference.
- House: one escrow row `CHALLENGE_HOUSE_REVENUE` for everything collected and not awarded. A sponsor's money can cover a shortfall (counted, so the books balance) but is never the house's to keep.
- No winner: `HOUSE_KEEPS` books the whole pool to the house; `REFUND_ENTRIES` refunds every entry except a disqualified one (whose forfeited fee goes to the house). If anyone qualified nothing is refunded, whatever the policy says.
- Funding: prizes bigger than entry money + sponsor are refused before anything moves.
- Reconciliation: money in (+ sponsor cover) = prizes + refunds + platform fees booked + house take, to the kobo, or the whole transaction rolls back. The three figures are stored on the challenge (`collectedKobo`, `awardedKobo`, `houseKobo`).
- Idempotent: FINALIZED → SETTLING by compare-and-swap; awards and escrow rows insert with ON CONFLICT DO NOTHING; SETTLING is retried by the sweep. Two settlements at once, or a retry after a crash, pay each prize once.
- Approval: required when a sponsor is involved, when auto-approval is off, or when prizes exceed the auto-approval limit. The approver can't be a winner, and can't be the creator of a sponsored challenge.
- Both prize models settle: fixed categories, and the older rank split (percentages of entry money after the platform's cut, plus sponsor).

**Templates.** The 25 definitions are code; the database keeps only the switches (`ChallengeTemplateState`: on/off, weekdays, fee/size overrides, last launch date and result). A template launches at most once per Lagos day (unique `(templateKey, launchedForDate)` on the challenge) and only while that day's entries are open; a launch that fails the publish rules leaves no draft behind and records why. Switching ON requires the game to be published and a Super Admin. Four of the five games are seeded unpublished by `scripts/seed-template-games.mjs`.

**Still open:** an image-metadata (EXIF) timestamp flag on evidence; OCR pre-fill of the submission form (never decides a prize); per-category settlement notifications beyond prize and result; the weekly-rotation presets (the weekday picker covers it).

## 10. Explicitly out of scope here

Automated score verification, multi-match aggregates, squad/clan challenges, AI-generated challenges, card-paid entry, public player-to-player wagers, XP/streaks/rivals (phase 4).
