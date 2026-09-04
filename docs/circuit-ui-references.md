# Circuit — UI References & Design System Direction

Six live products, visually inspected (not recalled from memory) at both
desktop and mobile resolution, in-browser, on 2026-09-04. Screenshots and
page text were captured directly from each site; nothing here is guessed.
The goal isn't to copy any one of them — it's to lift one strong,
verified pattern from each and combine them into a design system that
actually serves Circuit's own requirements (NFR-1's 3G/mid-range-Android
target chief among them).

## 1. FACEIT — trust signals, format-status cards, leaderboard

**Desktop** (`faceit.com`, verified via screenshot): black/white/orange
hero — "CHALLENGE YOUR AIM" — with a live counter directly under the
subhead: "273,046 players online right now" (a green pulse dot next to
the number). Below the fold: a row of format cards (Matchmaking / Team
Leagues / Daily Cups / Official Qualifiers), each tagged with a status
chip — LIVE, COMING SOON, EVERY HOUR, REGISTRATION OPEN. Further down, a
global leaderboard table: Rank / Player / Country / Skill level / ELO.

**Mobile** (375×812, verified via screenshot): the hero collapses to a
single centered column — hamburger icon replaces the nav bar, headline
stacks to two lines, the live counter and CTA ("PLAY NOW") stay directly
below the fold with nothing competing for attention above them.

**What Circuit takes**: a live/trust counter on the homepage ("X
tournaments live right now" / "X players competing today") costs nothing
to build (it's a `COUNT` query) and does more for a first-time Nigerian
organizer's trust than any amount of copy. The format-status chip is
directly reusable as a **StatusPill** component driving off
`Tournament.status` and `Registration` deadlines (LIVE / REGISTRATION
OPEN / STARTING SOON / COMPLETED). The leaderboard table is a clean
future-facing pattern once Circuit has enough match history to rank
players — not a V1 need, but worth keeping the table styling in the
system for later.

## 2. start.gg — discovery feed, status pills, mobile bottom nav

**Desktop** (`start.gg`, verified via page text extraction): the
homepage is a sectioned discovery feed — FEATURED EVENTS, CIRCUITS AND
LEAGUES, ONLINE, UPCOMING, RECENTLY FINISHED — each section a horizontal
row of event cards. Every card carries the same fields regardless of
section: game name(s), date range, city (or "Online"), attendee count,
and a status pill where relevant ("Registration Open", "Registration
Closing Soon").

**Mobile** (375×812, verified via screenshot): a **bottom tab bar** —
Menu / Home / Search / Rankings / Log in — replaces the desktop top nav
entirely. The card feed drops to a single column. A native-app install
banner and a cookie-consent sheet both render as full-width stacked
cards above the feed, confirming the single-column-stack pattern extends
to system chrome, not just content.

**What Circuit takes**: this maps almost one-to-one onto Circuit's own
discovery requirements — sectioning the tournament/battle feed by
timing and status (Live Now / Open for Registration / Starting Soon /
Recently Finished) is exactly the shape REG-1 through REG-3 and BRK-1
already imply, so the visual pattern needs no invention, just adoption.
The **StatusPill** component from FACEIT gets its second, independent
confirmation here — two unrelated products converging on the same
"colored pill on a card" solution is a strong signal it's the right
component, not a coincidence to second-guess. For mobile, start.gg's
**bottom tab bar** is the clearer primary-nav answer for Circuit's own
mobile layout (Home / Discover / My Tournaments / Wallet / Profile) than
a hamburger drawer would be — it keeps the highest-frequency actions one
tap away, which matters more on the mid-range-Android/3G conditions
NFR-1 targets than a drawer's extra tap does.

## 3. Challonge — format-picker grid, bracket-first framing

**Desktop** (`challonge.com`, verified via page text extraction): the
core product decision — "what kind of competition is this" — is
answered by a single grid of format cards split into Basic (Single
Elimination, Double Elimination, Free For All, Round Robin) and Advanced
(Swiss, Leaderboard, Time Trial, Single Race, Grand Prix), each a name
plus a one-line plain-language description of the elimination rule. A
live "recently created" ticker runs below it — real tournaments, their
organizer's handle, format, and participant count, refreshed
continuously. Community cards further down show a PRO badge and follower
count per organizer community.

**What Circuit takes**: the **format-picker grid** is the right shape
for Circuit's own tournament-creation flow (BRK-1/BRK-2) — organizers
choosing Single vs. Double Elimination should see the same plain-language
one-liner Challonge uses, not a raw enum dropdown. The "recently created"
live ticker is the same trust-building idea as FACEIT's counter, applied
to the creation side of the marketplace rather than the play side — worth
running both. The PRO-badge-plus-follower-count pattern on organizer
communities is a reasonable visual precedent for an `OrganizerProfile`
verification badge later, though V1 has no organizer-reputation system to
attach it to yet.

## 4. Linear — dashboard shell, kanban board, activity timeline

**Desktop** (`linear.app`, verified via screenshot): a dark-mode
application shell — a narrow left sidebar (icon + label rows: Pulse,
Inbox, My Issues, Reviews, then a Workspace section: Initiatives,
Projects) — opens onto a central detail panel for a single item (an
issue), which pairs a structured **activity timeline** (who did what,
timestamped, oldest to newest, each entry a single terse line) with a
right-hand contextual panel that can hold either metadata (priority,
assignee, labels, cycle) or a live process (an AI agent's running
commentary). Elsewhere on the page: a kanban board (Backlog / Todo / In
Progress / Done columns, card counts in each header) and a horizontal
roadmap/timeline chart plotting projects against months.

**What Circuit takes**: this is the strongest reference for the
**Organizer Dashboard** the PRD and Build Plan both call out as V1's
most complex screen. The sidebar-plus-detail-panel shell maps directly
onto an organizer's view (Tournaments / Battles / Disputes / Payouts in
the sidebar, a selected tournament or dispute filling the detail panel).
The **activity timeline** pattern is close to a direct requirement, not
just inspiration — BRK-5's dispute resolution and BRK-10's auto-accept
both need an auditable, timestamped log of what happened and when, and
Linear's terse one-line-per-event styling is a clean way to render
exactly that data. The kanban board is a natural fit for an organizer
tracking multiple tournaments across their lifecycle stages (Draft →
Registration Open → Live → Completed).

## 5. Discord — three-column shell, presence without sockets

**Desktop** (`discord.com`, verified via screenshot of the hero product
mockup): the enduring Discord shell — a narrow icon rail (servers) feeds
a channel-list column, which feeds the main chat pane — plus small green
presence dots next to avatars throughout the marketing page's copy
("SEE WHO'S AROUND TO CHILL").

**What Circuit takes**: not the chat infrastructure itself — the stack
doc already rules out a WebSocket server for V1, and Discord's real-time
chat is exactly the kind of infrastructure that decision is protecting
against building prematurely. What's worth taking is narrower and
cheaper: the **presence dot** as a visual idiom (green = active/live)
reads as "real-time" to a user even when it's backed by ordinary polling,
which is precisely the illusion BRK-7's "live-ish" bracket updates need —
Circuit can afford the visual idiom without affording the infrastructure
behind Discord's version of it. If Battles (BTL-2's open board) ever
grows a lightweight comment or chat layer, the three-column shell is the
right precedent to return to — not before then.

## 6. Pinterest — collage hero, full-bleed board cards, stacked mobile auth

**Desktop** (`pinterest.com`, logged out, verified via screenshot + page
text): below the nav, a horizontal carousel of full-bleed board-preview
cards ("Elevated blokette: stylish at the stadium", "Football drills",
etc.) — each card is a single large image or looping video filling the
whole tile, with a small rounded overlay box in one corner carrying the
board title, curator, and pin count ("Pinterest UK · 106 Pins"). No
grid lines, no card border — the image *is* the card, text is layered
on top rather than below it.

**Mobile** (375×812, verified via screenshot): the signup screen leads
with an asymmetric **collage hero** — a large centered vertical tile
overlapping several smaller tiles of completely different aspect ratios
(portrait, square, landscape), stacked with a slight offset rather than
aligned to a grid. Immediately below it: three full-width, stacked,
heavily-rounded pill buttons ("Continue with email", "Continue with
Google", "I already have an account"), each a distinct visual weight
(solid red / white-bordered / light-grey) signaling primary vs.
secondary vs. tertiary action at a glance.

**What Circuit takes**: the full-bleed board card (image-as-card,
title+count overlaid in a corner) is a stronger option than a bordered
card for anything primarily visual — a featured-tournament banner on the
homepage, or a Battles highlight/proof-clip gallery, where the media
itself should carry the attention rather than compete with a card
frame. The **stacked-pill auth screen** is a directly usable pattern for
Circuit's own signup/login (ACC-2) on mobile: one dominant action
("Continue with email"), one federated-login alternative, one low-emphasis
fallback, each full-width and unambiguous about which is primary — exactly
the kind of low-friction, low-reading-effort flow NFR-1's target user
needs. The asymmetric collage hero is optional polish (a V2 homepage
treatment, not a V1 need) but worth keeping in the system as an
alternative to a plain static hero image once Circuit has enough real
tournament photography/clips to fill it with.

## Combining these into one system

No single reference above is "Circuit's UI" — each solved one part of
the problem well, verified live, and the job here is assembly, not
imitation:

| Component | Primary source | Used for |
|---|---|---|
| `StatusPill` | FACEIT + start.gg (independently converged) | Tournament/Battle/Registration status everywhere |
| `LiveCounter` | FACEIT | Homepage trust signal (players/tournaments live now) |
| `FormatCard` grid | Challonge | Tournament-creation format picker (BRK-1/2) |
| Sectioned discovery feed | start.gg | Homepage/discovery (REG-1–3, BRK-1) |
| Bottom tab bar (mobile nav) | start.gg | Primary mobile navigation |
| Sidebar + detail panel shell | Linear | Organizer Dashboard |
| `ActivityTimeline` | Linear | Dispute audit trail (BRK-5), auto-accept log (BRK-10) |
| Kanban board | Linear | Organizer's multi-tournament pipeline view |
| Presence dot idiom | Discord | "Live-ish" bracket/match status (BRK-7), without a socket server |
| Full-bleed board card | Pinterest | Featured-tournament banners, Battles proof-clip/highlight gallery |
| Stacked-pill auth screen | Pinterest | Signup/login flow, mobile (ACC-2) |

**Desktop → mobile strategy**: every reference that showed both
resolutions (FACEIT, start.gg) reflowed the same underlying content into
a single column and swapped top navigation for either a hamburger menu
or a bottom tab bar — never a second, separately-designed mobile
experience. Circuit should build the same way: one component set,
responsive by default, with the sidebar (Linear pattern, desktop) and
bottom tab bar (start.gg pattern, mobile) as the two nav shells around
otherwise-identical content. This is also the cheapest path given NFR-1
— no separate mobile build to maintain.

## What Circuit deliberately does not take

- **Discord's real-time chat infrastructure** — conflicts with
  `circuit-stack.md`'s explicit call to poll rather than run a
  WebSocket server for V1.
- **Linear's AI-agent-in-sidebar chrome** — a real feature of that
  product, entirely out of scope for Circuit V1.
- **Challonge's ad-supported free tier framing** — a monetization
  pattern, not a UI pattern; Circuit's own revenue model is already
  decided in the Strategy doc and doesn't need this borrowed.

## Open items worth revisiting

- None of the five references were tested against an actual 3G-throttled
  connection — NFR-1 should get a real Lighthouse/WebPageTest pass once
  there's a staging build, not just an assumption that "simple layout"
  equals "fast on 3G."
- The leaderboard/ranking table (FACEIT) and PRO-badge organizer
  reputation (Challonge) are both parked as V2+ ideas, not V1 scope —
  named here so they don't get built speculatively, matching the same
  restraint `circuit-stack.md` applies to infrastructure.
