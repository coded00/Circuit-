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
 * Laid out as a lobby list, not a card grid: every row is the same kind
 * of thing (someone waiting for an opponent), so a scannable list — game,
 * host, format, stake, age — beats a wall of art cards. Game filter chips
 * come from the games actually on the board right now. The homepage
 * carousel still uses ChallengeCard.
 */

import Link from "next/link";
import { ArrowRight, Plus, Swords, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getFriendIds } from "@/lib/friends";
import Poller from "@/app/Poller";
import { GameArtTile } from "@/components/GameArtTile";
import { Panel, PanelEmpty, PanelRows, panelRowClass } from "@/components/ui/Panel";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
function timeAgo(date: Date): string {
  const minutes = Math.round((date.getTime() - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

export default async function BattleBoardPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  const { game } = await searchParams;
  const user = await getCurrentUser();
  const friendIds = user ? await getFriendIds(user.id) : [];

  const allOpen = await prisma.battle.findMany({
    where: {
      status: "OPEN",
      OR: [{ visibility: "OPEN" }, ...(friendIds.length ? [{ visibility: "FRIENDS" as const, creatorId: { in: friendIds } }] : [])],
    },
    orderBy: { createdAt: "desc" },
    include: { creator: { select: { id: true, displayName: true, handle: true, avatarUrl: true } } },
  });

  const gameCounts = [...allOpen.reduce((m, b) => m.set(b.game, (m.get(b.game) ?? 0) + 1), new Map<string, number>())].sort(
    (a, b) => b[1] - a[1]
  );
  const activeGame = game ? (gameCounts.find(([g]) => g.toLowerCase() === game.toLowerCase())?.[0] ?? game) : null;
  const battles = activeGame ? allOpen.filter((b) => b.game.toLowerCase() === activeGame.toLowerCase()) : allOpen;
  const staked = allOpen.filter((b) => b.stakeAmount > 0).length;

  const chipClass = (active: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
      active ? "bg-foreground text-background" : "bg-surface-elevated text-muted hover:text-foreground"
    }`;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <Poller />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-3xl leading-none font-bold tracking-tight uppercase sm:text-4xl">Challenges</h1>
          <p className="text-sm text-muted">
            {allOpen.length === 0 ? (
              "Nobody's waiting right now — open one and see who bites."
            ) : (
              <>
                <span className="text-stat text-foreground">{allOpen.length}</span> open
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

      {gameCounts.length > 1 && (
        <nav aria-label="Filter by game" className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Link href="/battles" className={chipClass(!activeGame)} aria-current={!activeGame ? "page" : undefined}>
            All
            <span className="font-mono text-xs opacity-60">{allOpen.length}</span>
          </Link>
          {gameCounts.map(([g, count]) => {
            const active = activeGame?.toLowerCase() === g.toLowerCase();
            return (
              <Link key={g} href={`/battles?game=${encodeURIComponent(g)}`} className={chipClass(active)} aria-current={active ? "page" : undefined}>
                {g}
                <span className="font-mono text-xs opacity-60">{count}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <Panel title={activeGame ?? "Open now"} meta={battles.length || undefined}>
        {battles.length === 0 ? (
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
        ) : (
          <PanelRows>
            {battles.map((b) => {
              const mine = user?.id === b.creator.id;
              return (
                <Link key={b.id} href={`/battles/${b.id}`} className={`${panelRowClass} py-3.5`}>
                  <GameArtTile game={b.game} className="h-11 w-11 shrink-0 rounded-[10px]" hideLabel imgWidth={120} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <PlayerAvatar person={b.creator} size="xs" />
                      <span className="truncate text-sm font-semibold">{b.creator.displayName}</span>
                      {mine && <span className="badge bg-accent-volt-soft text-foreground">Yours</span>}
                    </div>
                    <span className="text-metadata flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{b.game}</span>
                      <span aria-hidden>·</span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Swords size={11} />
                        {b.format === "BEST_OF_3" ? "Bo3" : "Single"}
                      </span>
                      {b.visibility === "FRIENDS" && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="flex shrink-0 items-center gap-1">
                            <Users size={11} />
                            Friends
                          </span>
                        </>
                      )}
                      <span aria-hidden className="hidden sm:inline">
                        ·
                      </span>
                      <span className="hidden shrink-0 sm:inline">{timeAgo(b.createdAt)}</span>
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className={`text-stat text-sm ${b.stakeAmount > 0 ? "text-gold" : "text-muted"}`}>
                      {b.stakeAmount > 0 ? formatNaira(b.stakeAmount) : "Free"}
                    </span>
                    <span className="text-[11px] text-muted sm:hidden">{timeAgo(b.createdAt)}</span>
                  </div>
                  <span
                    className={`hidden shrink-0 items-center gap-1 rounded-[var(--radius-control)] px-3.5 py-2 text-sm font-semibold transition sm:flex ${
                      mine ? "border border-border-strong text-foreground" : "bg-accent-volt text-accent-volt-foreground group-hover:brightness-95"
                    }`}
                  >
                    {mine ? "View" : "Accept"}
                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </PanelRows>
        )}
      </Panel>

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
