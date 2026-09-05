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
and Flutterwave for payments, `lucide-react` for icons. One full-stack
codebase — see the PRD's D5 and NFR-3 for why both payment rails exist and
why raw card/bank data never touches this app directly.

Everything beyond the app framework itself — hosting, file storage,
scheduled work, push/email, rate limiting, observability — is decided in
[`docs/circuit-stack.md`](docs/circuit-stack.md), each choice tied back to
the specific requirement that drove it. Read that before adding a new
dependency; it also names what V1 deliberately does *not* need yet (a job
queue, Redis, a WebSocket server) so those don't get added speculatively.

## Status

**Phases 0 through 6 done.** Every task from the Build Plan is built
except Phase 8 (see below — it needs real third-party keys this
environment doesn't have). What's here, matched to the Build Plan's task
IDs:

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
| P5-1 | Organizer dashboard — detail-panel content (nav now lives in the app-wide sidebar, see the NEXA rebuild below), kanban board of every tournament the user organizes grouped by status | `src/app/dashboard/layout.tsx`, `src/components/nav/AppSidebar.tsx`, `src/app/dashboard/page.tsx` |
| P5-2 | Per-tournament manage view — registrants + payment status, bracket state, disputes surfaced above the fold | `src/app/dashboard/tournaments/[id]/page.tsx` — this is P2-7 too, not a separate build. Moved here from `/tournaments/[id]/manage` in the UI rework below; the sidebar shell replaces that route's own page chrome |
| P5-3 | Dispute-ruling notification | already existed as a side effect of Phase 3's `openDispute()` — `notify(organizerId, "DISPUTE_NEEDS_RULING", ...)` |
| P5-4 | Escrow visibility (read-only fees collected/refunded/payout status) | same manage view — no dashboard action can release escrow itself, matching ORG-4 |
| P6-3 | Abuse reporting (reason code + optional evidence upload) | `src/app/players/[handle]/report/`, `src/app/api/reports/route.ts` |
| P6-4 | Account suspension (blocks register/pay/accept-Battle; visible to the affected user) | `src/app/staff/reports/`, `src/app/api/staff/users/[id]/{suspend,unsuspend}/route.ts`, suspension check in the registrations and Battle-accept routes |
| P5-5 | Registrant CSV export | `src/app/api/tournaments/[id]/registrants.csv/route.ts` |
| — | **Phase 7 audit**: 3 of 9 `NotificationType`s had never actually fired (`TOURNAMENT_CANCELLED`, `REGISTRATION_CAP_FILLED`, `REGISTRATION_CLOSED`) despite the pipeline existing since P0-6. Wired up all three — cancellation now notifies every registrant, not just the ones getting refunded. |
| — | **UI rework, pass 1**: the first design pass against `docs/circuit-ui-references.md` skipped its three most structural patterns. Added: the dashboard sidebar+panel shell above; `ActivityTimeline` (`src/components/ActivityTimeline.tsx`) on the match page, a chronological log of submissions/disputes/rulings; `/dashboard/disputes` and `/dashboard/payouts` as dedicated cross-tournament views (previously only visible per-tournament); `/dashboard/battles` for the organizer's own Battles. Also fixed two smaller doc gaps: homepage discovery cards were missing their start date, and auth screens had no visual weight tier between the primary submit button and the secondary link (`.btn-ghost` in `globals.css`). |
| — | **UI rework, pass 2**: pass 1 built every pattern structurally but ran it all through one uniform global theme, so every screen looked like the same generic app instead of carrying its own source platform's character. Added zone scoping (`[data-zone="dashboard"]`) so `/dashboard/*` read as always-dark and dense (Linear) while everything else stayed a light-first marketing zone (FACEIT/start.gg). **Superseded by pass 3 below** — the zone mechanism, `src/proxy.ts`, and OS-driven light mode are all gone now that the whole app is one always-dark theme. Also from this pass, still current: `.card-row` shared class replacing hand-rolled row markup, `StatusPill`'s `size="md"`. |
| — | **UI rework, pass 3 — full NEXA-reference rebuild**: the user supplied a screenshot of a reference gaming platform ("NEXA": dark, purple-branded, image-led cards, persistent sidebar, hero banner, notification bell, search, a social feed) after passes 1-2 still read as "a sheet." Full rebrand — green to purple/violet (`--brand: #7c3aed`), one always-dark theme, no OS light mode. One persistent sidebar + top bar (`src/components/nav/AppSidebar.tsx`, `TopBar.tsx`, `MobileTabBar.tsx`) replaces the old `SiteHeader`/`BottomTabBar`/`DashboardNav` three-way split — see the Conventions section for the shape. New: a real notification bell + inbox surfacing the existing write-only pipeline (`src/lib/notification-format.ts`, `src/app/api/notifications/`, `src/app/notifications/`); cross-entity search (`src/app/api/search/route.ts`, `src/components/SearchInput.tsx`); a community feed (`CommunityPost` model, `src/app/community/`) — Global tab real, Friends/Teams shown disabled (no friend-graph/team model exists, never scoped); `GameArtTile` (`src/components/GameArtTile.tsx`) — deterministic generated-gradient "cover art" per game name, since no real photography/licensing path exists; homepage hero banner, Next Tournament spotlight, Live Now widget, and a cross-game leaderboard (`src/lib/standings.ts`, extracted from the ladder page); profile stat cards + per-game ladder rank chips (no Level/XP — no such data exists); a disabled "Connect your accounts" row on `/account` (no OAuth — needs real per-platform developer credentials, same blocker class as Phase 8); Wallet/Marketplace/Rewards sidebar items landing on `ComingSoon` placeholder pages (no product spec exists for any of the three yet). New dependency: `lucide-react` (no icon library existed before; every icon was a raw emoji). |
| — | **UI rework, pass 4 — homepage positional match**: pass 3 got the app-wide system right but the homepage itself was still a loose interpretation. Rebuilt to mirror the reference's exact structure while keeping every existing section/data untouched: left-aligned hero copy (was centered), `ConnectAccountsRow` (`src/components/ConnectAccountsRow.tsx`, shared with `/account`) with circular platform icons positioned directly under the hero, `CardCarousel` (`src/components/CardCarousel.tsx`) — a scroll-snap row with hover arrows — replacing the wrapping grid for every tournament/battle card row, cards restyled prize-forward with icon rows (Calendar/Users), Live Now/Next Tournament/Leaderboard widgets restyled to the reference's exact visual hierarchy (avatar circles, big bold prize figure). |

Also added, not in the original Build Plan: a lightweight `streamUrl`
field on Tournament and Battle (link only, no embed, no live-status
check — the PRD's actual "streaming build-out" is documented V2 scope,
this is not that). Shown as a "📺 Watch stream" link on the tournament/
Battle page and a 📺 badge on homepage cards.

Every Build Plan task is now built except **Phase 8 (NFR & Analytics)**,
which needs real Sentry/PostHog account keys this environment doesn't
have — see docs/circuit-stack.md's Observability section for what it
needs once those exist. Also not attempted: a real Lighthouse/3G pass
(NFR-1) and resolving `payoutMethodRef` into a live Paystack recipient
code (needs a live Paystack sandbox) — both flagged as open items in
their respective source docs already.

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
  never `zinc-*` or `black/white` opacity classes. One always-dark theme —
  no OS-driven light mode, no per-route zone — brand is purple (`--brand:
  #7c3aed`); `--status-live` stays green (still distinct, reads as
  "active/go"), `--status-complete` is teal (moved off violet once brand
  took that hue). Shared primitives: `.field-input`/`.field-label`/
  `.btn-primary`/`.btn-secondary`/`.btn-ghost`/`.btn-danger`/`.card`/
  `.card-row` (global CSS classes) and `<StatusPill>`/`<OptionCard>`/
  `<LiveCounter>`/`<ActivityTimeline>`/`<GameArtTile>`/`<ComingSoon>`
  (`src/components/`). `.btn-ghost` is the lowest-emphasis tier (Pinterest's
  stacked-pill pattern) — use it for a screen's secondary action, never as a
  `.btn-secondary` substitute.
- **Navigation is one persistent shell, not per-page chrome.**
  `src/components/nav/AppSidebar.tsx` (desktop, sectioned: Primary/Footer/
  Organize/Staff) + `TopBar.tsx` (search/notifications/Create/account) +
  `MobileTabBar.tsx` (5-slot bottom bar + a "Menu" sheet for overflow) are
  mounted once in `src/app/layout.tsx`, which calls `getCurrentUser()` a
  single time and passes it down — don't add a new top-level nav component
  or call `getCurrentUser()` again just to render a nav item; add the item
  to the existing sidebar/menu sheet instead. The dashboard's own mobile
  sub-nav strip (`MobileTabBar`, pathname-gated) is the one remaining
  per-route nav exception, coexisting with the main tab bar.
- **The organizer dashboard is nav-less content, not its own shell.**
  `src/app/dashboard/layout.tsx` only guards the route — its nav lives in
  `AppSidebar`'s "Organize" section and the mobile sub-nav strip above.
  Add a new organizer-facing view under `src/app/dashboard/`, not back
  under `/tournaments/[id]/`.
- **No real game cover-art exists.** `GameArtTile` (`src/components/
  GameArtTile.tsx`) generates a deterministic gradient + name overlay from
  a hash of the game string — never point an `<img>`/`next/image` at an
  external URL for game art, there's no licensing path or asset pipeline
  for it.
- **Wallet/Marketplace/Rewards are placeholders, not features.** Each
  route (`src/app/wallet/`, `/marketplace/`, `/rewards/`) renders
  `<ComingSoon>` — no product spec exists for any of the three. Don't
  build real logic into them without a separate scoping pass first, same
  for the disabled "Connect your accounts" row on `/account` (no OAuth —
  needs real per-platform developer credentials) and the Community
  feed's Friends/Teams tabs (no friend-graph/team model exists).
