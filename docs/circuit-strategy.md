# Circuit — Strategy

> Converted from the published Circuit Strategy artifact for local reference. The canonical, designed version lives at https://claude.ai/code/artifact/c31a90db-7742-4492-90a7-47be71c05daf — treat this file as content, not layout. Illustrative example blocks (fictional player names, mock UI cards) are marked as such below; everything else is the actual strategy content.

## 01. Executive Summary

*Circuit is infrastructure for competitive gaming, not a game itself. It sits around the titles people already play — EA FC, Call of Duty, PUBG, eFootball, Valorant — and replaces the improvised stack most organizers currently use to run a tournament: a WhatsApp broadcast list, a Google Form, a spreadsheet of names, a manually drawn bracket, and a payment link sent around after the fact.*

The product is built around one idea: a tournament shouldn't be a one-time administrative project. It should be a page that creates itself from a form, a bracket that updates itself as matches finish, and an audience that builds itself as people follow the competition rather than just the player. Do that well enough, and Circuit becomes the place where a gaming competition is created, distributed, played, watched, and monetized without leaving the platform. Not every competitive moment needs an organizer, either — two players who just want to settle it can open a Battle directly against each other, stake optional (section 05).

This draft keeps the strongest parts of the original concept — the tournament lifecycle, the shareable link model, the follow/subscribe layer, the creator economy ambition — and adds what a concept document usually skips: a grounded read on who else already occupies this space, a build sequence that doesn't try to ship everything on day one, and the trust, payments, and regulatory questions that come with the words "prize pool" and "earn."

> **Note:** Why now. Competitive multiplayer gaming has outgrown the tools communities use to organize it. Registration and bracket software exists, streaming platforms exist, and chat apps exist — but they exist as three separate products maintained by three separate companies, none of which are trying to connect a viewer to the bracket they're watching. That gap between "administer the competition" and "build an audience around it" is the opening.

## 02. Market Position & Differentiation

*Circuit doesn't compete with the games. It competes with the workaround — and, less comfortably, with several existing categories of tool that each solve one slice of the problem well.*

| Category | Examples | What it gives organizers | What it doesn't do |
| --- | --- | --- | --- |
| Bracket & registration tools | Challonge, start.gg, Toornament | Handle registration and brackets at real scale — Challonge alone puts the number at 36M+ brackets run across 1.2M communities; start.gg goes further, layering in event discovery, player rankings, and even fantasy-esports features on top | None of the three publicly foreground a way for the organizer, or the players, to earn from the audience a tournament draws — the tooling is aimed at running the event, not building a following around it |
| Coordination hubs | WhatsApp, Discord, Google Forms | Free, familiar, zero setup cost | No structure — brackets and payouts are still manual, nothing public-facing |
| Broadcast platforms | Twitch, YouTube Gaming | Real audiences, real monetization tools | No concept of a bracket, a match, or a tournament as a structured object |
| Adjacent, worth avoiding | Real-money esports betting sites | Also chase gaming audiences with an "earn" hook | Wagering on outcomes, not competing in them — Circuit's "earn" needs to stay legibly about skill and creator monetization, not get mistaken for this category (see §10) |

One genuinely specific gap turned up while checking the incumbents: Battlefy's own list of supported titles runs to League of Legends, Dota 2, Valorant, Hearthstone, Call of Duty, Apex Legends, and Mobile Legends — PC and console "hardcore esports" games. None of the major bracket platforms foreground the mobile-first, sports-sim titles that anchor Circuit's own examples: EA FC, eFootball, PUBG Mobile. That's a narrower, more defensible opening than "nobody connects bracket to broadcast to payout" — it's closer to "the existing tools weren't built with this market's most-played games in mind."

Beyond that specific gap, no single product currently owns the full chain from bracket to broadcast to payout — and none of them give a player a way to challenge a specific rival directly outside a tournament, the way Battles do (section 05). That's Circuit's wedge — but it's a wedge that requires being credible at all three simultaneously, not just the best at one of them. A bracket tool with a bolted-on chat feature isn't this; neither is a streaming site with a tournament widget.

### The differentiator, as a loop

*Watch → Follow → Register → Compete → Stream it → Build audience*

On Twitch you watch a streamer. On Discord you talk to other players. On a bracket tool you register for a competition nobody outside it will ever see. On Circuit, the same person can watch a match, follow the winner, register against them next week, and stream that rematch to the audience both of them built — because it's all one graph of players, tournaments, and matches, not three disconnected apps.

### Why this doesn't stay a wedge on its own

None of this is defensible as a feature list. start.gg and Challonge are both better capitalized than a new entrant, and a "communities" tab plus a challenge board are not hard things for them to bolt on once the pattern is proven — feature parity is a matter of engineering time, not insight, for either of them. What has to end up defensible instead is liquidity: the organizers who already have their community and history on Circuit, the players with a reputation and a Battle record they'd lose by switching, the viewers already following. That only becomes a real moat after months of the loop actually running, which is exactly why the go-to-market in section 11 argues for depth in one city and one game before breadth — a thin presence in ten cities is a feature list a competitor can match; genuine liquidity in one is what they'd have to out-organize, not just out-build.

> **Note:** What's verified vs. not. The Challonge, start.gg, and Battlefy details above come from a live check of each product's own site (September 2026). Toornament's public page didn't surface enough detail to say anything specific — its own marketing copy is thin — and pricing pages for Challonge's competitors, plus a planned check of Nigerian payment gateways for §11, didn't load in time this session. Treat this as a real first pass, not a finished competitive audit: worth a deeper look — pricing tables, recent funding or shutdowns, any new entrant — before this positioning goes in front of investors.

## 03. Who It Serves

*Four groups, and — importantly — most people will occupy more than one at once. A tournament organizer is usually also a player. A viewer who follows a bracket for a week often registers for the next one.*

- **PLR** — **Competitive social gamers**: Ages roughly 18–35, playing EA FC, COD, PUBG, eFootball, Valorant and similar titles, already competing informally and looking for recognition, not just a scoreboard.
  - *Currently*: Find tournaments through word of mouth or a community WhatsApp group; register with a screenshot and a name in a spreadsheet.
  - *Open question*: What keeps a player registering on Circuit instead of just joining whichever WhatsApp group their friends are already in?
- **ORG** — **Tournament organizers**: Gaming communities, university clubs, gaming lounges, influencers, and independent event runners already hosting competitions manually — the core platform users.
  - *Currently*: Run everything across WhatsApp, Google Forms, spreadsheets, hand-drawn brackets, and personal payment links.
  - *Open question*: Will they trust Circuit to hold entry fees and prize money, or will they keep payments off-platform out of habit?
- **CRT** — **Creators & streamers**: Gamers who broadcast gameplay and tournament coverage and build an audience around it, whether or not they play in the events they cover.
  - *Currently*: Stream on Twitch or YouTube with no structured link to the tournament they're covering; viewers can't jump from the stream to the bracket.
  - *Open question*: Do they broadcast natively on Circuit, or does Circuit just embed their existing Twitch/YouTube stream — which is the far cheaper build?
- **VWR** — **Viewers & supporters**: People who watch matches, follow tournaments and players, and want to support the competitions and creators they care about.
  - *Currently*: Watch on Twitch/YouTube if a stream exists at all; have no way to follow a tournament as a thing distinct from a channel.
  - *Open question*: Is there enough consistently live content in year one to justify a "watch" tab at all, or does that come later?

## 04. The Tournament Lifecycle

*This is the part of the product that has to work perfectly before anything else matters — it's the reason an organizer opens the app at all.*

1. Name, game, format, player cap, registration requirements, date, rules, prize info, registration deadline.
2. Circuit generates a dedicated tournament page automatically, with a unique shareable link.
3. The organizer drops the link into WhatsApp, Instagram, TikTok, X, Discord, or Telegram — no manual collection across five apps.
4. Players view rules, format, and participants, then register; the organizer watches the roster fill from a dashboard.
5. At the registration deadline, Circuit generates the knockout bracket, round-robin group, or league table automatically.
6. Each match gets its own page; players report results, and the bracket advances as matches close out.

> *Illustrative example:* Tournament page — example Registration open Lagos EA FC Championship Game EA FC Players 64 Format Knockout Starts September 20 Register

### Round of 8, generated automatically

> *Illustrative example:* Quarterfinals ITZ_REXX vs VEE_SKILLZ BALOGUN10 vs KING_JAY THE_WIZARD vs CHIOMA_GG ODUYA_FC vs NOVA_ELITE → Semifinals ITZ_REXX vs KING_JAY THE_WIZARD vs NOVA_ELITE → Final ITZ_REXX vs NOVA_ELITE 🏆 ITZ_REXX

## 05. Battles & Open Challenges

*Not every match needs sixty-four players and a bracket. Sometimes it's two people who just want to settle it — and a pure tournament structure never gives them a way to do that without going and finding an organizer to enter under.*

A Battle is a direct, one-on-one challenge that lives outside the tournament structure entirely. A player opens one — game, format (single match or best-of-three), and an optional stake — then either posts it to an open challenge board or calls out a specific rival by tag. Anyone browsing by game, stake range, or rank can accept an open one; a called-out player gets a direct notification instead. Accepting locks both sides' stakes in escrow and spins up a match page — the same object a tournament match already needs, just without a bracket wrapped around it. That reuse is the point: Battles aren't a second system to design and build, they're the match-and-escrow primitive from section 04, offered on its own.

> *Illustrative example:* Open challenge — example Open KING_JAY wants a battle Game EA FC Format Best of 3 Stake ₦2,000 · winner takes ₦3,800 Accept challenge

Finding a contender means two different things, not one: an open board anyone can browse and accept from, for a player who just wants a match, and a ranked ladder per game that makes it possible to look up and call out a specific rival — the difference between "who wants to play" and "I want to play you."

### Where this needs its own guardrails

A stake on your own match is a materially different thing from a stranger betting on someone else's — it's the same line already drawn in section 02's "adjacent, worth avoiding" row, the one separating Circuit from a betting site. Keeping that line clean is a product requirement, not just a legal one: nothing in Battles should ever let a non-participant place money on a match they aren't playing in. Beyond that, peer-to-peer stakes carry a risk tournament entry fees don't — two accounts can collude to launder money through engineered losses far more easily than anyone could fix a 64-player bracket — so Battles need their own stake limits and pattern detection rather than borrowing tournament trust mechanics wholesale. Section 10 covers this in full.

### Who referees a Battle

A tournament dispute has a natural first responder — the organizer, or a mod they've appointed. A Battle doesn't: it's two strangers with no third party in the room, so the tournament dispute flow can't just be copied over unchanged. Instead, a disputed Battle goes to a Circuit trust & safety queue, not an organizer — both sides submit their evidence (screenshot or clip), and a reviewer decides, the same role a payments dispute team plays for a bank. If the evidence is genuinely inconclusive, the default isn't "pick a winner" — it's void the match, return both stakes, and log it against both accounts, since an unresolvable dispute is itself a signal worth tracking. That queue is real headcount, not a config screen, and it's the reason section 12 gates staked Battles behind V2 rather than shipping them alongside tournaments on day one — there needs to be a team in place to actually run it before real money is riding on a match nobody organized.

## 06. Watch, Discover & Connect

*A tournament that no one outside it can see is still just a private event with better admin. The watch layer is what turns it into entertainment.*

### Streaming, without needing the organizer's help

Organizers don't have to stream their own events — approved streamers and community members can cover individual matches, rounds, semis, or finals, which is what turns one tournament into a small ecosystem of creators around it. A single quarterfinal round can have four different streamers covering four different matches at once, each pulling their own audience into the same bracket — that fan-out is exactly what a single organizer-run stream can't do alone. In year one, this almost certainly means embedding existing Twitch and YouTube streams against the match page rather than building native streaming infrastructure — see the roadmap in section 12 for why that sequencing matters.

> *Illustrative example:* Live match — example Live now Semi-final: ITZ_REXX vs KING_JAY Tournament Lagos EA FC Championship Casting 2 streamers live Watching 2,431 Watch live

The point of tying the stream to the match page rather than leaving it on Twitch alone is the jump between them: a viewer watching the semi-final can tap straight to the bracket to see what the final looks like, or to the winner's profile to follow them before the next event — the "watch → follow → register" loop from section 02 only works if that jump is one tap, not a search. The same logic applies after the match ends: a highlight clipped from that stream re-enters the discovery feed on its own, pulling new viewers back to a tournament that's already over and toward the organizer's next one.

### The discovery feed

Home shouldn't just be a list of tournaments — it's where all five kinds of content GameOn's original concept described live side by side, so a visitor with no specific tournament in mind still has something to do.

- **Live**: Matches and streams happening right now.
- **Tournaments**: Trending and upcoming, closing registration soon.
- **Clips**: Highlights pulled from finished matches.
- **Creators**: Trending players, streamers, and organizers.
- **Communities**: Clans and groups worth joining — see section 07.

### Every tournament gets a home page

- **Overview**: Format, dates, rules, prize info at a glance.
- **Bracket**: The live structure of the competition, updating as matches close.
- **Matches**: Upcoming, live, and completed — each with its own page.
- **Discussion**: Chat scoped to this one event — not the same as the host's permanent community space, next section.

Following a tournament (not just a person) drives notifications: registration opening or closing, the tournament starting, a follower's own match being ready, a live match beginning, results going up. That's the mechanic that keeps someone checking back across a multi-week tournament rather than forgetting it exists after registering.

## 07. Communities

*A tournament has a start date and an end date. The people who show up to every one of an organizer's events don't — and if Circuit only models the event, it loses that group in the gap between tournaments, which is exactly when a WhatsApp group is stickier than the platform.*

A community is a persistent object, not a byproduct of a bracket: a page with members, a following count, pinned announcements, general discussion that isn't scoped to any single event, and a calendar of what that group has run before and what's coming next. Some communities are built around an organizer's recurring events — Lagos Gaming League, from section 08, is one. Others never run a tournament of their own at all: a campus gaming club, a fan base for a specific title, a friend group's clan — places people go to talk and coordinate, that occasionally spin up or co-host an event rather than existing to produce one.

> *Illustrative example:* Community page — example EA FC Lagos Members 8,140 Hosted events 14 This week No tournament running — discussion active Join

The flywheel runs both directions. A tournament feeds its community: players and viewers who show up for one bracket get a natural, one-tap invitation to join the host's permanent space rather than evaporating once the final ends. And a community feeds its next tournament: a group with an existing following can announce a new event straight into a warm audience, instead of starting from zero the way a brand-new organizer would on Challonge or Toornament. That second direction is the real retention argument for building communities as a first-class object rather than an afterthought — it's what turns a one-time tournament organizer into the recurring one described in section 08.

Community discussion needs the same light moderation tooling as tournament chat — pin, mute, report — covered under section 10, not a separate system.

## 08. The Creator & Organizer Economy

*The original concept's most interesting claim is that running tournaments can be a career, not just a hobby someone does with a spreadsheet. That only holds if organizers can build a durable, public identity — not just a one-off event page that disappears after the final.*

> *Illustrative example:* Organizer profile — example Lagos Gaming League Followers 12.4K Upcoming FC Weekend Cup · COD Mobile League · University Championship Follow

Three kinds of creators sit inside this economy, and the platform has to serve all three without treating them as the same role: players who build a following through skill and personality, streamers who broadcast gameplay and competitions without necessarily playing in them, and organizers who build a following around the events themselves. An organizer's growth loop looks like: create → build a following → host recurring events → grow a community → get covered by streamers → gain subscribers → attract sponsorship.

## 09. Business Model

*Six revenue lines, each tied to a different piece of the loop — and each worth being specific about rather than listing as a bullet.*

- **01. Advertising**: Placement against the discovery feed, live matches, and tournament pages — standard audience monetization once viewership exists.
- **02. Subscriptions**: Fans subscribe to players, streamers, organizers, or a tournament series for perks: match notifications, exclusive content, early access to future events.
- **03. Gifts & coins**: Viewers buy Circuit Coins and send gaming-themed gifts during live matches; the platform takes a cut before payout, the same mechanic that funds Twitch Bits and TikTok gifting.
- **04. Circuit Pass**: A premium membership: ad-free viewing, priority registration for popular tournaments, cosmetic profile perks.
- **05. Tournament services**: Free tier for casual organizers; paid tiers unlock branded tournament pages, advanced analytics, larger player caps, and featured placement in discovery.
- **06. Sponsorship**: Brands sponsor a tournament, a stream, a community, or co-fund a prize pool — sold against the audience data the platform accumulates.

### How the money actually moves

Entry fees, prize pools, and Battle stakes should all sit in Circuit escrow, not in an organizer's personal account or held informally between two players — released to the winner once a result is verified, not the moment someone claims victory. That's not just a trust mechanism (see section 10); it's also where a modest processing fee becomes a legitimate seventh revenue line, and it's the difference between "platform" and "another payment link someone has to trust a stranger with."

> **Note:** Treat every number above as a starting hypothesis, not a committed price. The right subscription price and coin take rate depend on what the target market will actually pay — worth testing narrowly before it's written into a pitch deck.

## 10. Trust & Fair Play

*This section doesn't exist in most tournament-platform pitches, and it's usually the reason those platforms stall. The moment Circuit touches real money and a "winner," it inherits problems a bracket app never had to solve — and Battles push that further, since a peer-to-peer stake is a sharper edge than a fixed-field tournament entry fee.*

| Problem | Why it bites | What helps |
| --- | --- | --- |
| Self-reported scores | Whoever reports first can just claim the win; disputes are inevitable at scale — and for the anchor titles specifically, there's no shortcut around this. EA FC, eFootball, and PUBG Mobile don't expose match results to third-party platforms; there's no API to fall back on the way there might be for a title with an open developer program | Screenshot/video proof, a dispute window, and an organizer or mod adjudication step, treated as the permanent primary mechanism rather than a stopgap until an API arrives — which means the human review team is core V1 infrastructure, not a later upgrade |
| Real-money prize pools | Entry-fee fraud, chargebacks, and payout disputes are a different risk class from a subscription business | Escrow, payout thresholds that trigger identity verification, and a clear refund policy for cancelled events |
| Peer-to-peer stakes | A Battle wager between two players reads closer to gambling than a tournament entry fee, and two accounts can collude to launder money through engineered losses far more easily than anyone could fix a 64-player bracket | Stake limits for new or unverified accounts, no non-participant wagering ever, self-exclusion and cool-off tools, and pattern detection on repeated losses between the same two accounts |
| Disputes with no organizer | A Battle has no third party in the room the way a tournament has an organizer, so there's nobody to adjudicate by default | A Circuit trust & safety queue reviews evidence from both sides directly; an inconclusive case voids the match and returns both stakes rather than guessing a winner (section 05) |
| Minors and real money | Gaming audiences skew younger than a platform plans for, and age verification isn't optional the moment cash is attached to a match | Age verification gates any feature that moves real money — entry fees, prize payouts, Battle stakes — while free tournaments and no-stake Battles stay open to everyone; nothing cash-related is reachable before that gate passes |
| Regulatory status | Skill-based competitions are generally treated differently from games of chance, but cash entry fees, prize pools, and peer-staked Battles can each draw different scrutiny, and rules vary by market | Legal review before launch in any market with real money on the table — this is not something to infer from a product spec |
| Multi-accounting & smurfing | Undermines fairness in exactly the competitions the platform exists to run well | Verified identity tied to one competitive account, reputation history visible on player profiles |

> **Warning:** Not legal advice. The regulatory line between "skill-based esports tournament" and something requiring gaming/gambling licensing shifts by jurisdiction and by exactly how entry fees, prize pools, and peer-staked Battles are structured — Battles in particular sit closer to that line than tournaments do. Get this reviewed by counsel in each launch market before real money goes live on either — it's cheaper to ask up front than to unwind later.

> **Note:** Considered and rejected: spectator betting on tournament outcomes. Letting a third party who isn't playing wager on who wins a match is bookmaking, not a skill contest, in effectively every jurisdiction — a different regulatory category from tournament entry fees or Battle stakes, requiring its own gambling license, its own banking relationships, and clearing a much harder app-store bar. It also undoes the positioning in section 02: Circuit exists on the "competing in it" side of the line from real-money esports betting sites, not the "wagering on it" side. If spectator engagement around outcomes is worth building later, a free pick'em with no cash payout gets most of the upside without making Circuit a licensed betting operator — but that's a deliberate future call, not an assumption to build toward by default.

## 11. Go-to-Market Strategy

*Circuit is a four-sided marketplace — players, organizers, creators, viewers — which means the usual cold-start problem, squared. Organizers won't switch from WhatsApp for three players; viewers won't show up for a tournament with no stream; streamers won't cover a bracket with no audience.*

The way through is supply-side first, narrow, and manual before it's automated: recruit a small number of respected community organizers in one city and one anchor game — the doc's own examples already point to Lagos and EA FC, which is a reasonable starting wedge given how accessible both are on mobile and low-end hardware. Give that first cohort white-glove onboarding, help running their first bracket, and a co-funded prize pool for season one. Let Circuit staff act as a temporary "concierge" layer — manually helping run early tournaments — rather than betting the launch on a fully self-serve product nobody has stress-tested yet. Expand game-by-game and city-by-city only once one combination is genuinely working, not before.

Because the target organizer and player base is mobile-first and often data-cost-sensitive, the product needs to be light — fast on a mid-range Android phone, cheap on data, and built assuming payments run through the rails people already use locally (Paystack and Flutterwave, in a Nigeria-anchored launch) rather than assuming card-first checkout.

### Don't gate the audience an organizer already has

An organizer in that first cohort is being asked to give up an existing following, not just a workflow — Lagos Gaming League's 12.4K didn't come from Circuit, and if reaching them requires everyone to make an account first, that following never actually moves over. Viewing a tournament page, watching a live match, and following an organizer or a Battle should all work before anyone signs up for anything; an account should only be required at the point where money or identity is actually involved — registering to compete, staking a Battle, or claiming a payout. Treat account creation as friction to defer, not a funnel step to optimize.

## 12. MVP & Roadmap

*The original concept is a complete vision, not a build order — it doesn't distinguish what has to exist on day one from what only makes sense once there's an audience to support it. Sequencing that is the single highest-leverage edit to make here.*

> **Note:** The one number to watch: verified match completions per week. A tournament match or a Battle that reaches a result both sides accept — not started, not disputed into a stalemate, actually completed — is the atomic unit of value the whole product is built around; every other feature exists to produce more of them or to monetize the audience around them. It's a better early signal than registrations (which measure intent, not delivery) or GMV (which V1 won't have much of yet). Two supporting numbers worth tracking alongside it: organizer 30-day retention, since section 11's whole go-to-market bet is that a small cohort keeps coming back rather than trying once and returning to WhatsApp; and dispute rate as a share of completed matches, the leading indicator for whether section 10's trust model is actually holding.

**V1 — Tournament OS: Prove the organizer will actually switch**

Create tournament, shareable page, registration, automatic knockout bracket, match pages with self-reported results and a dispute button, organizer dashboard — plus no-stake Battles, to prove the challenge-and-match mechanic before any money is riding on it.

Ships: Knockout brackets; Registration + shareable link; Organizer dashboard; No-stake Battles

Deferred: Live streaming; Coins & gifting; Ads & subscriptions; Staked Battles

**V2 — Watch & follow: Turn a tournament into something worth watching**

Embedded live streams (via Twitch/YouTube, not native infrastructure), the five-tile discovery feed, community pages, follow/subscribe to organizers and tournaments, notifications, clip linking, and staked Battles — unlocked once tournament escrow and dispute handling are proven at V1 and reviewed per launch market.

Ships: Stream embeds; Community pages; Follow & notifications; Round-robin & league formats; Staked Battles

Deferred: Native streaming; Full clip-editing suite

**V3 — Creator economy: Let the platform pay people**

Coins & gifting, Circuit Pass, sponsorship tooling, advanced organizer analytics, and — only once volume justifies the cost — native streaming.

Ships: Gifting economy; Sponsorship tools; Premium organizer tier

Deferred: Anything not yet proven wanted by V1/V2 usage

> **Note:** The one build decision that matters most: don't build streaming infrastructure from day one. Embedding an organizer's existing Twitch or YouTube stream on the match page delivers most of the "watch" experience at a fraction of the engineering cost, and buys time to find out whether tournaments generate enough consistent live content to justify owning that infrastructure later.

## 13. Risks & Open Questions

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Cold-start liquidity | A four-sided marketplace can stay empty on all four sides at once | Supply-first GTM (section 11), concierge-mode launch, single city + game to start |
| Score disputes | One badly handled dispute can end an organizer's trust in the platform permanently | Proof requirements, dispute windows, visible adjudication process (section 10) |
| Handling real money | Fraud, chargebacks, and payout timing expectations are a different operational burden than a content app | Escrow, payout thresholds, clear refund policy, legal review per market |
| Peer wagering optics | Battles read closer to person-to-person gambling than tournament entry fees, which raises regulatory exposure and the "is this a gambling app" risk with app stores and payment processors | Launch Battles stake-free first (V1), gate staked Battles behind legal review and per-market rollout (V2), keep spectator betting explicitly out of scope |
| Building streaming too early | Native streaming infrastructure is expensive and can burn runway before there's content to justify it | Embed existing platforms through V2; build native only once volume demands it |
| The name itself | Plain circuit.com is already an active (if obscure) B2B collaboration tool — the bare word isn't clean, even though it beats "Game On" for distinctiveness | Launch on a gaming-native TLD or modifier — circuit.gg, The Circuit, PlayCircuit — and confirm trademark clearance before it's on pitch decks and merchandise |
| Platform dependency | Score verification and embeds may depend on EA/Xbox/PlayStation APIs or Twitch/YouTube embed policies Circuit doesn't control | Design score reporting to work without API access as the default path; treat API integrations as an enhancement, not a dependency |

## 14. Long-Term Vision

*Strip away the roadmap and the risk register, and the long-term bet is simple: the tools for running a competition and the tools for broadcasting one shouldn't be different products maintained by different companies with no idea the other exists.*

A user should be able to come to Circuit and create a tournament, discover one, register, compete, follow the journey, watch it live, stream it themselves, build a following, subscribe to the players and organizers they care about, and get paid for doing any of the above well — all inside one graph of players, matches, and tournaments, rather than stitched together across five apps that were never designed to talk to each other.