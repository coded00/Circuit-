/**
 * Circuit — homepage (MVP rework spec sections 11-17). "Light to
 * discover, dark to compete": a dark cinematic hero, then a light
 * curated feed — Featured Competitions, Explore by Game, Upcoming
 * Competitions, Open Challenges, and (logged in) Your Circuit. The
 * exhaustive, filterable tournament browse experience lives on
 * `/compete` now; this page shows a curated slice of each, all real
 * data, no fabrication.
 */

import Link from "next/link";
import { Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { CircuitHero } from "@/components/CircuitHero";
import { FeaturedCompetitions } from "@/components/FeaturedCompetitions";
import { ExploreTheCircuit } from "@/components/ExploreTheCircuit";
import { OpenChallenges } from "@/components/OpenChallenges";
import { YourCircuit } from "@/components/YourCircuit";
import { GAME_ACTIVITY } from "@/lib/circuitActivity";
import { formatNotification } from "@/lib/notification-format";
import { globalStandings } from "@/lib/standings";

const cardSelect = {
  id: true,
  name: true,
  game: true,
  status: true,
  format: true,
  entryFee: true,
  participantCap: true,
  streamUrl: true,
  startAt: true,
  prizeAmount: true,
  prizeText: true,
  _count: { select: { registrations: { where: { status: "CONFIRMED" as const } } } },
} as const;

export default async function Home() {
  const user = await getCurrentUser();

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
  ] = await Promise.all([
    prisma.tournament.findMany({
      where: { status: { in: ["OPEN", "LIVE"] }, prizeAmount: { not: null } },
      orderBy: { prizeAmount: "desc" },
      take: 4,
      select: cardSelect,
    }),
    prisma.tournament.findMany({
      where: { status: { in: ["OPEN", "LIVE"] } },
      orderBy: { startAt: "asc" },
      take: 8,
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
      where: { status: "OPEN", visibility: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { creator: { select: { displayName: true } }, targetUser: { select: { displayName: true } } },
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
  ]);

  const topLeaderboard = leaderboard.slice(0, 5);

  return (
    <div className="flex w-full flex-1 flex-col gap-8 p-6 sm:p-8">
      <CircuitHero />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_330px]">
        <div className="flex min-w-0 flex-col gap-8">
          <FeaturedCompetitions tournaments={featuredTournaments} />

          <ExploreTheCircuit games={gameCounts} />

          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-section-heading">Upcoming Competitions</h2>
              <Link href="/compete" className="text-xs font-medium text-accent-blue hover:underline">
                View All Competitions →
              </Link>
            </div>
            {upcomingTournaments.length === 0 ? (
              <div className="card flex flex-col items-center gap-1 py-10 text-center">
                <p className="text-sm text-muted">Nothing upcoming right now — be the first.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {upcomingTournaments.map((t) => (
                  <Link key={t.id} href={`/tournaments/${t.id}`} className="card-media card-hover flex flex-col">
                    <div className="flex flex-col gap-1 p-3">
                      <span className="text-card-title truncate font-semibold">{t.name}</span>
                      <span className="truncate text-xs text-muted">{t.game}</span>
                      <span className="text-metadata">
                        {t.startAt.toLocaleString("en-NG", { dateStyle: "medium" })}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <OpenChallenges battles={openBattles} />

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
          {topLeaderboard.length > 0 && (
            <div className="card flex flex-col gap-3">
              <h2 className="text-card-title flex items-center gap-2">
                <Trophy size={15} className="text-gold" />
                Leaderboard
              </h2>
              <div className="tabs">
                <span className="tab tab-active">Global</span>
                <span className="tab tab-disabled" title="Coming soon">
                  Friends
                </span>
                <span className="tab tab-disabled" title="Coming soon">
                  This Month
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {topLeaderboard.map((s, i) => (
                  <Link
                    key={s.userId}
                    href={`/players/${s.handle}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-elevated"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-4 shrink-0 font-mono text-xs text-muted">{i + 1}</span>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated text-xs font-semibold text-muted">
                        {s.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="truncate">{s.displayName}</span>
                    </span>
                    <span className="text-stat shrink-0 text-xs text-accent-blue">{s.wins}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
