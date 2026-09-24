/**
 * Circuit — homepage (MVP rework spec sections 11-17). "Light to
 * discover, dark to compete": a dark cinematic hero, then a light
 * curated feed — Featured Competitions, Explore by Game, Upcoming
 * Competitions, and Open Challenges. The
 * exhaustive, filterable tournament browse experience lives on
 * `/compete` now; this page shows a curated slice of each, all real
 * data, no fabrication — including the sidebar's `GamerNews` widget,
 * which is real, live gaming-outlet RSS content (src/lib/gamerNews.ts),
 * wrapped in its own Suspense boundary so a slow external feed can't
 * hold up the rest of this page's render.
 */

import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { CircuitHero } from "@/components/CircuitHero";
import { FeaturedCompetitions } from "@/components/FeaturedCompetitions";
import { ExploreTheCircuit } from "@/components/ExploreTheCircuit";
import { OpenChallenges } from "@/components/OpenChallenges";
import { UpcomingCompetitions } from "@/components/UpcomingCompetitions";
import { GamerNews } from "@/components/GamerNews";
import { CommunitiesCard } from "@/components/CommunitiesCard";
import { getJoinedCommunities } from "@/lib/community";
import { GAME_ACTIVITY } from "@/lib/circuitActivity";
import { globalStandings } from "@/lib/standings";
import { getFriendIds } from "@/lib/friends";
import { getActiveAnnouncement } from "@/lib/announcements";
import { openDueTournaments } from "@/lib/tournaments";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { Panel, PanelEmpty, PanelRows, panelRowClass } from "@/components/ui/Panel";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Gaming Tournaments & Esports Competitions in Nigeria",
  description:
    "Compete in real gaming tournaments and esports competitions on Circuit — register for Call of Duty, eFootball, PUBG Mobile and more, climb the leaderboard, win real prizes, and join a real gaming community.",
  path: "/",
});


const cardSelect = {
  id: true,
  name: true,
  game: true,
  status: true,
  format: true,
  teamSize: true,
  entryFee: true,
  participantCap: true,
  streamUrl: true,
  registrationOpenAt: true,
  posterUrl: true,
  startAt: true,
  prizeAmount: true,
  prizeText: true,
  _count: { select: { registrations: { where: { status: "CONFIRMED" as const } } } },
} as const;

/**
 * Real prize pools first (what "Featured" is supposed to mean), then
 * top up with other real OPEN/LIVE tournaments by soonest start date —
 * otherwise this row shows just one card whenever the dev/early-traffic
 * data happens to have only one prize-backed tournament, which reads as
 * broken rather than "not much on Circuit yet." Every card is still a
 * real tournament; nothing here is invented.
 */
async function getFeaturedTournaments(limit: number) {
  const prized = await prisma.tournament.findMany({
    where: { status: { in: ["OPEN", "LIVE"] }, prizeAmount: { not: null } },
    orderBy: { prizeAmount: "desc" },
    take: limit,
    select: cardSelect,
  });
  if (prized.length >= limit) return prized;

  const filler = await prisma.tournament.findMany({
    where: { status: { in: ["OPEN", "LIVE"] }, id: { notIn: prized.map((t) => t.id) } },
    orderBy: { startAt: "asc" },
    take: limit - prized.length,
    select: cardSelect,
  });
  return [...prized, ...filler];
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ leaderboard?: string }>;
}) {
  const { leaderboard: leaderboardScope } = await searchParams;
  await openDueTournaments();
  const user = await getCurrentUser();
  const friendLeaderboardActive = leaderboardScope === "friends" && !!user;
  const friendIds = user ? await getFriendIds(user.id) : [];

  const [
    featuredTournaments,
    upcomingTournaments,
    gameCounts,
    openBattles,
    leaderboard,
    homepageBanners,
    activeAnnouncement,
    joinedCommunities,
    openTournamentStats,
    openChallengeCount,
  ] = await Promise.all([
    getFeaturedTournaments(6),
    // "Upcoming" includes DRAFT on purpose (unlike Featured, which stays
    // OPEN/LIVE-only) — DRAFT here just means "hasn't reached its own
    // registrationOpenAt yet," not "not real." A tournament announced for
    // next week should read as upcoming today, not disappear until the
    // exact moment registration opens. The tournament page itself already
    // gates the actual Register button on the real date regardless of
    // status, so this can't let anyone register early.
    prisma.tournament.findMany({
      where: { status: { in: ["DRAFT", "OPEN", "LIVE"] } },
      orderBy: { startAt: "asc" },
      take: 6,
      select: cardSelect,
    }),
    // One query for every open/live tournament's game, then matched against
    // each GAME_ACTIVITY name in memory — not 5 concurrent `count()` calls
    // (one per game), which was needlessly competing for connections
    // against the rest of this same Promise.all on every page load.
    prisma.tournament
      .findMany({ where: { status: { in: ["OPEN", "LIVE"] } }, select: { game: true } })
      .then((tournaments) =>
        GAME_ACTIVITY.map((g) => ({
          name: g.name,
          activeCompetitions: tournaments.filter((t) => t.game.toLowerCase().includes(g.name.toLowerCase())).length,
        })),
      ),
    prisma.battle.findMany({
      where: {
        status: "OPEN",
        OR: [{ visibility: "OPEN" }, ...(friendIds.length ? [{ visibility: "FRIENDS" as const, creatorId: { in: friendIds } }] : [])],
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        creator: { select: { displayName: true, avatarUrl: true } },
      },
    }),
    globalStandings(),
    prisma.homepageBanner.findMany({
      where: { enabled: true, OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] },
      orderBy: { order: "asc" },
    }),
    getActiveAnnouncement(),
    user ? getJoinedCommunities(user.id) : Promise.resolve([]),
    // Hero's live numbers — real counts/sums, same visibility rules as the lists.
    prisma.tournament.aggregate({ where: { status: { in: ["OPEN", "LIVE"] } }, _count: { _all: true }, _sum: { prizeAmount: true } }),
    prisma.battle.count({
      where: {
        status: "OPEN",
        OR: [{ visibility: "OPEN" }, ...(friendIds.length ? [{ visibility: "FRIENDS" as const, creatorId: { in: friendIds } }] : [])],
      },
    }),
  ]);

  const scopedLeaderboard = friendLeaderboardActive
    ? leaderboard.filter((s) => s.userId === user!.id || friendIds.includes(s.userId))
    : leaderboard;
  const topLeaderboard = scopedLeaderboard.slice(0, 5);
  const openChallengesPreview = openBattles.slice(0, 4);

  return (
    <div className="flex w-full flex-1 flex-col gap-8 px-4 py-6 sm:p-8">
      {activeAnnouncement && <AnnouncementBanner title={activeAnnouncement.title} body={activeAnnouncement.body} />}

      <CircuitHero
        tournaments={featuredTournaments}
        banners={homepageBanners}
        stats={{
          openTournaments: openTournamentStats._count._all,
          openChallenges: openChallengeCount,
          prizeMoney: openTournamentStats._sum.prizeAmount ?? 0,
        }}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_var(--right-rail-width)]">
        <div className="flex min-w-0 flex-col gap-8">
          <FeaturedCompetitions tournaments={featuredTournaments} />

          <ExploreTheCircuit games={gameCounts} />

          <OpenChallenges battles={openChallengesPreview} viewerId={user?.id} />

          <UpcomingCompetitions tournaments={upcomingTournaments} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {user && <CommunitiesCard communities={joinedCommunities} />}

          {(topLeaderboard.length > 0 || friendLeaderboardActive) && (
            <Panel
              title="Leaderboard"
              action={
                <Link href="/leaderboard" className="text-xs font-medium text-accent-blue hover:underline">
                  View all
                </Link>
              }
            >
              <div className="flex gap-1.5 border-t border-border px-5 py-3">
                <Link
                  href="/"
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${!friendLeaderboardActive ? "bg-foreground text-background" : "bg-surface-elevated text-muted hover:text-foreground"}`}
                >
                  Global
                </Link>
                {user ? (
                  <Link
                    href="/?leaderboard=friends"
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${friendLeaderboardActive ? "bg-foreground text-background" : "bg-surface-elevated text-muted hover:text-foreground"}`}
                  >
                    Friends
                  </Link>
                ) : (
                  <span title="Log in to see your friends' ranking" className="cursor-not-allowed rounded-full bg-surface-elevated px-3 py-1 text-xs font-medium text-muted/50">
                    Friends
                  </span>
                )}
              </div>
              {friendLeaderboardActive && topLeaderboard.length === 0 ? (
                <PanelEmpty>None of your friends have a completed Challenge yet.</PanelEmpty>
              ) : (
                <PanelRows>
                  {topLeaderboard.map((s, i) => (
                    <Link key={s.userId} href={`/players/${s.handle}`} className={`${panelRowClass} py-2.5`}>
                      <span
                        className={`w-5 shrink-0 text-center font-mono text-xs font-semibold tabular-nums ${i === 0 ? "text-gold" : i < 3 ? "text-foreground" : "text-muted"}`}
                      >
                        {i + 1}
                      </span>
                      <PlayerAvatar person={s} size="sm" className={i === 0 ? "ring-2 ring-gold" : ""} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.displayName}</span>
                      <span className="text-stat shrink-0 text-xs text-muted">
                        <span className="text-foreground">{s.wins}</span>W
                      </span>
                    </Link>
                  ))}
                </PanelRows>
              )}
            </Panel>
          )}

          <Suspense
            fallback={
              <div className="card flex flex-col gap-3">
                <div className="skeleton h-4 w-28" />
                <div className="flex flex-col gap-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="skeleton h-14 w-14 shrink-0 rounded-[8px]" />
                      <div className="flex flex-1 flex-col gap-1.5 pt-1">
                        <div className="skeleton h-3 w-20" />
                        <div className="skeleton h-4 w-full" />
                        <div className="skeleton h-3 w-3/4" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            }
          >
            <GamerNews />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
