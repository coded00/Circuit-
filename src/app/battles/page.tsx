/**
 * Circuit — open Challenge board (Build Plan P4-2, maps: BTL-2). User-
 * facing "Challenges" is the existing free `Battle` feature under its
 * MVP-rework name — same model/route/logic, copy-only rename.
 *
 * Still-OPEN-status Battles show here, OPEN-visibility to everyone or
 * FRIENDS-visibility to a viewer who's actually a friend of the creator
 * (see src/lib/friends.ts) — a TARGETED challenge is invisible to
 * everyone but its target (delivered via notification, BTL-3), not a
 * variant of this board.
 *
 * Each challenge is an opponent card (the shared ChallengeCard, also used by
 * the homepage's Open challenges): who is waiting, their win-loss record in
 * that game, the stake, and Accept. Game filter chips come from the games
 * actually on the board right now.
 */

import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { openBattleFilter } from "@/lib/battles";
import { getFriendIds } from "@/lib/friends";
import Poller from "@/app/Poller";
import { Panel, PanelEmpty } from "@/components/ui/Panel";
import { ChallengeCard } from "@/components/ChallengeCard";
import { DailyChallengeCard } from "@/components/DailyChallengeCard";
import { loadDailyChallengeCards, RECENT } from "@/lib/dailyChallengeFeed";
import { nextDeadline } from "@/lib/dailyChallengeView";
import { challengeRecords } from "@/lib/standings";
import { recordKey } from "@/lib/challengeView";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "1v1 Gaming Challenges",
  description:
    "Challenge other players to 1v1 gaming battles, play your match, and build your competitive record on Circuit. Every result is verified.",
  path: "/battles",
});


export default async function BattleBoardPage({ searchParams }: { searchParams: Promise<{ game?: string; kind?: string; f?: string }> }) {
  const { game, kind: kindParam, f: filterParam } = await searchParams;
  // One board for both kinds of challenge: head-to-head Battles and Daily Challenges. `kind` narrows it.
  const kind: "all" | "head-to-head" | "daily" = kindParam === "daily" ? "daily" : kindParam === "head-to-head" ? "head-to-head" : "all";
  const user = await getCurrentUser();
  const friendIds = user ? await getFriendIds(user.id) : [];

  const allOpen = await prisma.battle.findMany({
    where: {
      AND: [openBattleFilter(), { OR: [{ visibility: "OPEN" }, ...(friendIds.length ? [{ visibility: "FRIENDS" as const, creatorId: { in: friendIds } }] : [])] }],
    },
    orderBy: { createdAt: "desc" },
    include: { creator: { select: { id: true, displayName: true, handle: true, avatarUrl: true } } },
  });

  const allDaily = (await loadDailyChallengeCards({ userId: user?.id })).cards;
  // Results: challenges that have been played, being checked or settled — shown so a finished challenge can be found again.
  const recentResults = kind === "head-to-head" ? [] : (await loadDailyChallengeCards({ userId: user?.id, statuses: RECENT, limit: 6 })).cards;

  // Game chips count both kinds, so a game with only a Daily Challenge still shows up as a filter.
  const gameCountMap = new Map<string, number>();
  if (kind !== "daily") for (const b of allOpen) gameCountMap.set(b.game, (gameCountMap.get(b.game) ?? 0) + 1);
  if (kind !== "head-to-head") for (const d of allDaily) gameCountMap.set(d.gameName, (gameCountMap.get(d.gameName) ?? 0) + 1);
  const gameCounts = [...gameCountMap].sort((a, b) => b[1] - a[1]);
  const activeGame = game ? (gameCounts.find(([g]) => g.toLowerCase() === game.toLowerCase())?.[0] ?? game) : null;
  const battles = kind === "daily" ? [] : activeGame ? allOpen.filter((b) => b.game.toLowerCase() === activeGame.toLowerCase()) : allOpen;
  const dailyShown = kind === "head-to-head" ? [] : activeGame ? allDaily.filter((d) => d.gameName.toLowerCase() === activeGame.toLowerCase()) : allDaily;
  const now = new Date();

  // Filters for the daily cards: type, price, sponsorship, urgency, and what the viewer can do.
  const FILTERS = [
    ["weapon", "Weapon", (c: (typeof allDaily)[number]) => c.kind === "WEAPON"],
    ["skill", "Skill", (c: (typeof allDaily)[number]) => c.kind === "SKILL"],
    ["combined", "Combined", (c: (typeof allDaily)[number]) => c.kind === "COMBINED"],
    ["free", "Free", (c: (typeof allDaily)[number]) => c.entryFee === 0],
    ["paid", "Paid", (c: (typeof allDaily)[number]) => c.entryFee > 0],
    ["sponsored", "Sponsored", (c: (typeof allDaily)[number]) => c.sponsorKobo > 0],
    ["ending", "Ending soon", (c: (typeof allDaily)[number]) => {
      const d = nextDeadline(c, now);
      return !!d && d.at.getTime() - now.getTime() <= 6 * 3_600_000;
    }],
    ["joinable", "Available to join", (c: (typeof allDaily)[number]) => c.status === "OPEN" && now < c.entryClosesAt && c.entered < c.maxEntrants && !c.mine],
    ["joined", "Joined", (c: (typeof allDaily)[number]) => !!c.mine],
  ] as const;
  const activeFilter = FILTERS.find(([key]) => key === filterParam) ?? null;
  const dailyFiltered = activeFilter ? dailyShown.filter(activeFilter[2]) : dailyShown;
  const filterHref = (key: string | null) => {
    const q = new URLSearchParams();
    if (kind !== "all") q.set("kind", kind);
    if (activeGame) q.set("game", activeGame);
    if (key) q.set("f", key);
    const qs = q.toString();
    return qs ? `/battles?${qs}` : "/battles";
  };
  const staked = allOpen.filter((b) => b.stakeAmount > 0).length;
  const records = await challengeRecords(battles.map((b) => b.game));

  const chipClass = (active: boolean) =>
    `flex shrink-0 items-center gap-1.5 cut-xs px-3.5 py-1.5 text-sm font-medium transition ${
      active ? "bg-foreground text-background" : "bg-surface-elevated text-muted hover:text-foreground"
    }`;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <Poller />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="text-eyebrow text-accent-volt">Challenges</span>
          <h1 className="font-display text-3xl leading-[0.98] font-bold tracking-tight sm:text-4xl">There&apos;s always another level.</h1>
          <p className="text-sm text-muted">
            {allOpen.length === 0 && allDaily.length === 0 ? (
              "Nobody's waiting right now. Open one and see who bites."
            ) : (
              <>
                <span className="text-stat text-foreground">{allOpen.length}</span> open
                {allDaily.length > 0 && (
                  <>
                    {" · "}
                    <span className="text-stat text-foreground">{allDaily.length}</span> daily
                  </>
                )}
                {staked > 0 && (
                  <>
                    {" · "}
                    <span className="text-stat text-gold">{staked}</span> with a stake
                  </>
                )}
                {" · first to accept plays"}
              </>
            )}
          </p>
        </div>
        <Link href="/battles/new" className="btn-primary self-start sm:self-auto">
          <Plus size={15} />
          Create challenge
        </Link>
      </header>

      <nav aria-label="Filter challenges" className="scrollbar-hide -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {([
          ["all", "All", allOpen.length + allDaily.length],
          ["head-to-head", "Head-to-head", allOpen.length],
          ["daily", "Daily", allDaily.length],
        ] as const).map(([key, label, count]) => (
          <Link
            key={key}
            href={key === "all" ? (activeGame ? `/battles?game=${encodeURIComponent(activeGame)}` : "/battles") : `/battles?kind=${key}${activeGame ? `&game=${encodeURIComponent(activeGame)}` : ""}`}
            className={chipClass(kind === key)}
            aria-current={kind === key ? "page" : undefined}
          >
            {label}
            <span className="font-mono text-xs opacity-60">{count}</span>
          </Link>
        ))}
        {kind !== "head-to-head" && allDaily.length > 0 && (
          <>
            <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border-strong" />
            {FILTERS.map(([key, label]) => (
              <Link key={key} href={filterHref(key)} className={chipClass(activeFilter?.[0] === key)} aria-current={activeFilter?.[0] === key ? "page" : undefined}>
                {label}
              </Link>
            ))}
            {activeFilter && (
              <Link href={filterHref(null)} className="shrink-0 px-2 text-xs font-medium text-muted hover:text-foreground">
                Clear
              </Link>
            )}
          </>
        )}
      </nav>


      {gameCounts.length > 1 && (
        <nav aria-label="Filter by game" className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Link href={kind === "all" ? "/battles" : `/battles?kind=${kind}`} className={chipClass(!activeGame)} aria-current={!activeGame ? "page" : undefined}>
            All
            <span className="font-mono text-xs opacity-60">{gameCounts.reduce((n, [, c]) => n + c, 0)}</span>
          </Link>
          {gameCounts.map(([g, count]) => {
            const active = activeGame?.toLowerCase() === g.toLowerCase();
            return (
              <Link key={g} href={`/battles?${kind !== "all" ? `kind=${kind}&` : ""}game=${encodeURIComponent(g)}`} className={chipClass(active)} aria-current={active ? "page" : undefined}>
                {g}
                <span className="font-mono text-xs opacity-60">{count}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {dailyFiltered.length > 0 && (
        <section aria-label="Daily challenges" className="flex flex-col gap-3">
          {kind === "all" && <h2 className="font-display text-lg font-bold tracking-tight">Daily challenges</h2>}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {dailyFiltered.map((c) => (
              <DailyChallengeCard key={c.id} c={c} now={now} />
            ))}
          </div>
        </section>
      )}

      {kind !== "daily" &&
        (battles.length === 0 ? (
          dailyFiltered.length === 0 && (
            <Panel title={activeGame ?? "Open now"}>
              <PanelEmpty>
                {activeGame ? (
                  <>
                    No open {activeGame} challenges.{" "}
                    <Link href="/battles/new" className="text-accent-blue hover:underline">
                      Create one →
                    </Link>
                  </>
                ) : (
                  "No open challenges right now."
                )}
              </PanelEmpty>
            </Panel>
          )
        ) : (
          <section aria-label={activeGame ?? "Open challenges"} className="flex flex-col gap-3">
            {kind === "all" && dailyFiltered.length > 0 && <h2 className="font-display text-lg font-bold tracking-tight">Head-to-head</h2>}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {battles.map((b) => (
                <ChallengeCard key={b.id} battle={b} record={records.get(recordKey(b.game, b.creator.id)) ?? null} mine={user?.id === b.creator.id} />
              ))}
            </div>
          </section>
        ))}

      {recentResults.length > 0 && !activeFilter && (
        <section aria-label="Recent results" className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-bold tracking-tight">Recent results</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {(activeGame ? recentResults.filter((c) => c.gameName.toLowerCase() === activeGame.toLowerCase()) : recentResults).map((c) => (
              <DailyChallengeCard key={c.id} c={c} now={now} />
            ))}
          </div>
        </section>
      )}

      {kind === "daily" && dailyFiltered.length === 0 && (
        <Panel title={activeGame ?? "Daily challenges"}>
          <PanelEmpty>{activeFilter ? "No daily challenges match that filter right now." : activeGame ? `No daily ${activeGame} challenges right now.` : "No daily challenges open right now. New ones show up here as they're published."}</PanelEmpty>
        </Panel>
      )}

      <p className="text-center text-xs text-muted">
        Want a game right now?{" "}
        <Link href="/battles/new" className="font-medium text-accent-blue hover:underline">
          Send a Quick Match
        </Link>{" "}
        to every available player at once.
      </p>
    </div>
  );
}
