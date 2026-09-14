/**
 * Circuit — homepage (MVP rework spec sections 11-17). "Light to
 * discover, dark to compete": a dark cinematic hero, then a light
 * curated feed — Featured Competitions, Explore by Game, Upcoming
 * Competitions, Open Challenges, and (logged in) Your Circuit. The
 * exhaustive, filterable tournament browse experience lives on
 * `/compete` now; this page shows a curated slice of each, all real
 * data, no fabrication — including the sidebar's `GamerNews` widget,
 * which is real, live gaming-outlet RSS content (src/lib/gamerNews.ts),
 * wrapped in its own Suspense boundary so a slow external feed can't
 * hold up the rest of this page's render.
 */

import { Suspense } from "react";
import Link from "next/link";
import { Trophy, Crown } from "lucide-react";
import { CountUp } from "@/components/CountUp";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { CircuitHero } from "@/components/CircuitHero";
import { FeaturedCompetitions } from "@/components/FeaturedCompetitions";
import { ExploreTheCircuit } from "@/components/ExploreTheCircuit";
import { OpenChallenges } from "@/components/OpenChallenges";
import { UpcomingCompetitions } from "@/components/UpcomingCompetitions";
import { GamerNews } from "@/components/GamerNews";
import { YourCircuit } from "@/components/YourCircuit";
import { GAME_ACTIVITY } from "@/lib/circuitActivity";
import { formatNotification } from "@/lib/notification-format";
import { globalStandings } from "@/lib/standings";
import { getFriendIds } from "@/lib/friends";
import { getActiveAnnouncement } from "@/lib/announcements";
import { openDueTournaments } from "@/lib/tournaments";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";

const RANK_COLORS = ["#eab308", "#9ca3af", "#b45309"]; // gold, silver, bronze — same as ladder/page.tsx

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
    upcomingMatches,
    registeredCompetitions,
    activeChallenges,
    recentActivity,
    homepageBanners,
    activeAnnouncement,
  ] = await Promise.all([
    getFeaturedTournaments(3),
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
      take: 3,
      select: cardSelect,
    }),
    Promise.all(
      GAME_ACTIVITY.map(async (g) => ({
        name: g.name,
        activeCompetitions: await prisma.tournament.count({
          where: { status: { in: ["OPEN", "LIVE"] }, game: { contains: g.name, mode: "insensitive" } },
        }),
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
        targetUser: { select: { displayName: true } },
      },
    }),
    globalStandings(),
    user
      ? prisma.match.findMany({
          where: { OR: [{ playerAId: user.id }, { playerBId: user.id }], status: "UPCOMING" },
          orderBy: { createdAt: "desc" },
          take: 3,
          include: { tournament: { select: { name: true } }, battle: { select: { game: true } } },
        })
      : Promise.resolve([]),
    user
      ? prisma.registration.findMany({
          where: { userId: user.id, status: "CONFIRMED" },
          orderBy: { createdAt: "desc" },
          take: 3,
          include: { tournament: { select: { id: true, name: true, game: true } } },
        })
      : Promise.resolve([]),
    user
      ? prisma.battle.findMany({
          where: { OR: [{ creatorId: user.id }, { targetUserId: user.id }], status: { in: ["OPEN", "ACCEPTED"] } },
          orderBy: { createdAt: "desc" },
          take: 3,
        })
      : Promise.resolve([]),
    user
      ? prisma.notification.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 3,
        })
      : Promise.resolve([]),
    prisma.homepageBanner.findMany({
      where: { enabled: true, OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] },
      orderBy: { order: "asc" },
    }),
    getActiveAnnouncement(),
  ]);

  const scopedLeaderboard = friendLeaderboardActive
    ? leaderboard.filter((s) => s.userId === user!.id || friendIds.includes(s.userId))
    : leaderboard;
  const topLeaderboard = scopedLeaderboard.slice(0, 5);
  const openChallengesPreview = openBattles.slice(0, 3);

  return (
    <div className="flex w-full flex-1 flex-col gap-8 p-6 sm:p-8">
      {activeAnnouncement && <AnnouncementBanner title={activeAnnouncement.title} body={activeAnnouncement.body} />}

      <CircuitHero tournaments={featuredTournaments} banners={homepageBanners} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_330px]">
        <div className="flex min-w-0 flex-col gap-8">
          <FeaturedCompetitions tournaments={featuredTournaments} />

          <ExploreTheCircuit games={gameCounts} />

          <OpenChallenges battles={openChallengesPreview} />

          <UpcomingCompetitions tournaments={upcomingTournaments} />

          {user && (
            <YourCircuit
              upcomingMatches={upcomingMatches.map((m) => ({
                id: m.id,
                matchCode: m.matchCode,
                context: m.tournament?.name ?? m.battle?.game ?? "Match",
              }))}
              registeredCompetitions={registeredCompetitions.map((r) => ({
                id: r.id,
                tournamentId: r.tournament.id,
                name: r.tournament.name,
                game: r.tournament.game,
              }))}
              activeChallenges={activeChallenges.map((c) => ({ id: c.id, game: c.game, status: c.status }))}
              recentActivity={recentActivity.map((n) => ({ id: n.id, ...formatNotification(n.type, n.payload) }))}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {(topLeaderboard.length > 0 || friendLeaderboardActive) && (
            <div className="card flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-card-title flex items-center gap-2">
                  <Trophy size={15} className="text-gold" />
                  Leaderboard
                </h2>
                <Link href="/ladder" className="text-xs font-medium text-accent-blue hover:underline">
                  View All →
                </Link>
              </div>
              <div className="border-b border-border" />
              <div className="tabs">
                <Link href="/" className={`tab ${!friendLeaderboardActive ? "tab-active" : ""}`}>
                  Global
                </Link>
                {user ? (
                  <Link href="/?leaderboard=friends" className={`tab ${friendLeaderboardActive ? "tab-active" : ""}`}>
                    Friends
                  </Link>
                ) : (
                  <span className="tab tab-disabled" title="Log in to see your friends' ranking">
                    Friends
                  </span>
                )}
                <span className="tab tab-disabled" title="Coming soon">
                  This Month
                </span>
              </div>
              {friendLeaderboardActive && topLeaderboard.length === 0 ? (
                <p className="motion-fade-in py-4 text-center text-sm text-muted">
                  None of your friends have a completed Challenge yet.
                </p>
              ) : (
              <div className="flex flex-col gap-1">
                {topLeaderboard.map((s, i) => {
                  const medal = RANK_COLORS[i];
                  const isFirst = i === 0;
                  return (
                    <Link
                      key={s.userId}
                      href={`/players/${s.handle}`}
                      style={{ "--i": i } as React.CSSProperties}
                      className={`rank-row flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:translate-x-0.5 hover:bg-surface-elevated ${
                        isFirst ? "rank-first" : ""
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-3.5 shrink-0 text-center font-mono text-[11px] text-muted">{i + 1}</span>
                        <span className="relative shrink-0">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                              medal ? "text-black" : "border border-border bg-surface-elevated text-muted"
                            }`}
                            style={medal ? { backgroundColor: medal } : undefined}
                          >
                            {s.displayName.slice(0, 1).toUpperCase()}
                          </span>
                          {isFirst && (
                            <Crown
                              size={12}
                              aria-hidden
                              className="crown-bounce absolute -top-2 left-1/2 -translate-x-1/2 text-gold"
                            />
                          )}
                        </span>
                        <span className="truncate">{s.displayName}</span>
                      </span>
                      <span className="text-stat shrink-0 text-xs text-accent-blue">
                        <CountUp value={s.wins} />
                      </span>
                    </Link>
                  );
                })}
              </div>
              )}
            </div>
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
