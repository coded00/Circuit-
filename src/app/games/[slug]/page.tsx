/**
 * Circuit — public game hub (SEO brief section 3: "Create indexable pages
 * for supported games... each page should contain useful, unique content
 * rather than being a thin list of links").
 *
 * Real content only, built from actual Circuit activity for this game —
 * no invented "about this game" prose. Deliberately gated: findGameBySlug
 * (src/lib/games.ts) 404s for any slug with zero real tournaments/Battles
 * ever, rather than rendering an empty page for a dev/QA game-catalog
 * fixture ("Cancel Test", "Suspend Test", ...) or a genuinely unplayed
 * real game. Reuses FeaturedCompetitions/UpcomingCompetitions as-is
 * (same real card UI the homepage/calendar already use) rather than
 * hand-rolling a third tournament-card presentation.
 */

import { cache } from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { Trophy, Swords, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { findGameBySlug, realGameNames } from "@/lib/games";
import { gameStandings } from "@/lib/standings";
import { buildMetadata, tournamentPath } from "@/lib/seo";
import { getCurrentUser } from "@/lib/session";
import { safeJsonLd } from "@/lib/jsonLd";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { gameIsIndexable, leaderboardIsIndexable } from "@/lib/seoEligibility";
import { standingsForViewer } from "@/lib/leaderboardSeo";
import { canonicalGamePath, displayGameName, gameSeoForName } from "@/lib/gameSeo";
import { GameArtTile } from "@/components/GameArtTile";
import { FeaturedCompetitions } from "@/components/FeaturedCompetitions";
import { UpcomingCompetitions } from "@/components/UpcomingCompetitions";

const cardSelect = {
  id: true,
  name: true,
  game: true,
  status: true,
  format: true,
  teamSize: true,
  entryFee: true,
  participantCap: true,
  registrationOpenAt: true,
  posterUrl: true,
  startAt: true,
  prizeAmount: true,
  _count: { select: { registrations: { where: { status: "CONFIRMED" as const } } } },
} as const;

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

// react's cache() dedupes this within a single request — generateMetadata
// and the page component below both call it, but it only hits the DB once.
const getGamePageData = cache(async (slug: string) => {
  const game = await findGameBySlug(slug);
  if (!game) return null;

  const [active, completedCount, prizeSum, standings, allNames, publicTournaments, recentResults, watchable] = await Promise.all([
    prisma.tournament.findMany({
      where: { game, status: { in: ["OPEN", "LIVE", "DRAFT"] } },
      orderBy: { startAt: "asc" },
      take: 12,
      select: cardSelect,
    }),
    prisma.tournament.count({ where: { game, status: "COMPLETE" } }),
    prisma.tournament.aggregate({ where: { game }, _sum: { prizeAmount: true } }),
    gameStandings(game),
    realGameNames(),
    prisma.tournament.count({ where: { game, status: { in: ["OPEN", "CLOSED", "LIVE", "COMPLETE"] } } }),
    prisma.tournament.findMany({
      where: { game, status: "COMPLETE" },
      orderBy: { startAt: "desc" },
      take: 8,
      select: { id: true, name: true, startAt: true, prizeAmount: true, _count: { select: { registrations: { where: { status: "CONFIRMED" } } } } },
    }),
    prisma.tournament.findFirst({
      where: { game, status: "LIVE", OR: [{ streamUrl: { not: null } }, { registrations: { some: { status: "CONFIRMED", streamUrl: { not: null } } } }] },
      select: { id: true, name: true },
    }),
  ]);

  const info = await gameSeoForName(game);
  const related = allNames.filter((n) => n !== game).slice(0, 6);
  return {
    game,
    displayName: displayGameName(game, info),
    canonicalPath: await canonicalGamePath(game),
    relatedGames: await Promise.all(related.map(async (name) => ({ name, path: await canonicalGamePath(name) }))),
    active,
    completedCount,
    totalPrize: prizeSum._sum.prizeAmount ?? 0,
    standings,
    publicTournaments,
    recentResults,
    watchable,
    indexable: gameIsIndexable({ publicTournaments, completedWithEightEntrants: recentResults.filter((t) => t._count.registrations >= 8).length }),
  };
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getGamePageData(slug);
  if (!data) return buildMetadata({ title: "Game not found", description: "", path: `/games/${slug}`, noindex: true });

  const { displayName, canonicalPath, active, standings, indexable } = data;
  const description =
    active.length > 0
      ? `${active.length} open ${displayName} tournament${active.length === 1 ? "" : "s"} on Circuit right now. Register, compete, and climb the ${displayName} leaderboard.`
      : `Real ${displayName} tournaments and 1v1 Challenges on Circuit. Esports competitions with real prizes.${standings.length ? ` See the current ${displayName} leaderboard.` : ""}`;

  return buildMetadata({
    title: `${displayName} Tournaments & Esports Competitions`,
    description,
    path: canonicalPath,
    noindex: !indexable,
  });
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getGamePageData(slug);
  if (!data) notFound();

  // An old or alternate address (/games/codm) goes to the canonical one.
  if (`/games/${slug}` !== data.canonicalPath) permanentRedirect(data.canonicalPath);

  const { game, displayName, active, completedCount, totalPrize, standings, relatedGames, recentResults, watchable } = data;
  const viewer = await getCurrentUser();
  const topPlayers = await standingsForViewer(standings.slice(0, 5), !!viewer);
  const boardPath = `/leaderboard/${data.canonicalPath.replace("/games/", "")}`;
  const openNow = active.filter((t) => t.status === "OPEN" || t.status === "LIVE");
  const announced = active.filter((t) => t.status === "DRAFT");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Tournaments", path: "/compete" }, { name: displayName, path: data.canonicalPath }])) }}
      />
      <div
        data-surface="dark"
        className="relative flex min-h-[180px] w-full flex-col justify-end overflow-hidden cut-lg [--cut-line:var(--border)] border border-border p-6 sm:p-8"
      >
        <GameArtTile game={game} fill hideLabel imgWidth={1200} />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundImage: "linear-gradient(0deg, var(--background) 15%, transparent 70%)" }}
        />
        <div className="relative z-10 flex flex-col gap-2">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {displayName} Tournaments
          </h1>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="badge badge-neutral bg-surface-elevated/80 text-foreground">
              <Trophy size={12} />
              {completedCount + openNow.length} tournament{completedCount + openNow.length === 1 ? "" : "s"}
            </span>
            {totalPrize > 0 && (
              <span className="badge badge-neutral bg-surface-elevated/80 text-foreground">
                <Trophy size={12} />
                {formatNaira(totalPrize)} in real prizes
              </span>
            )}
            {standings.length > 0 && (
              <span className="badge badge-neutral bg-surface-elevated/80 text-foreground">
                <Users size={12} />
                {standings.length} ranked player{standings.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
      </div>

      {watchable && (
        <Link href={`/tournaments/${watchable.id}/watch`} className="btn-primary watch-attn self-start">
          <span className="watch-dot" aria-hidden /> Watch {watchable.name} live
        </Link>
      )}

      {openNow.length > 0 && (
        <FeaturedCompetitions
          tournaments={openNow}
          title={`Open ${game} Tournaments`}
          viewAllHref={`/compete?game=${encodeURIComponent(game)}`}
        />
      )}

      {announced.length > 0 && (
        <UpcomingCompetitions tournaments={announced} />
      )}

      {openNow.length === 0 && announced.length === 0 && (
        <div className="card flex flex-col items-center gap-2 py-12 text-center">
          <Trophy size={24} className="text-muted" />
          <p className="text-sm text-muted">
            No open {game} tournaments right now — {completedCount} have run on Circuit so far.
          </p>
          <Link href={`/battles?game=${encodeURIComponent(game)}`} className="btn-secondary mt-2">
            <Swords size={14} />
            Find a {game} Challenge instead
          </Link>
        </div>
      )}

      {recentResults.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-section-heading">Recent {displayName} results</h2>
          <ul className="divide-y divide-border border-y border-border">
            {recentResults.map((t) => (
              <li key={t.id}>
                <Link href={tournamentPath(t)} className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:text-accent-volt">
                  <span className="min-w-0 truncate font-medium">{t.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {t.startAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })} · {t._count.registrations} {t._count.registrations === 1 ? "entry" : "entries"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {topPlayers.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-section-heading">{displayName} Leaderboard</h2>
            {leaderboardIsIndexable(standings.length) && (
              <Link href={boardPath} className="text-sm text-accent-volt hover:underline">
                Full leaderboard
              </Link>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {topPlayers.map((s) => {
              const row = (
                <>
                  <span className="w-5 shrink-0 text-center text-sm font-bold text-muted">{s.rank}</span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center cut-avatar border border-border bg-surface-elevated text-xs font-semibold text-muted">
                    {s.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{s.displayName}</span>
                    {s.handle && <span className="text-metadata truncate">@{s.handle}</span>}
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-muted">
                    {s.wins}W – {s.losses}L
                  </span>
                </>
              );
              return s.handle ? (
                <Link key={s.rank} href={`/players/${s.handle}`} className="card-row flex items-center gap-3 p-3">
                  {row}
                </Link>
              ) : (
                <div key={s.rank} className="card-row flex items-center gap-3 p-3">
                  {row}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {relatedGames.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-border pt-6">
          <h2 className="text-section-heading">Other Games on Circuit</h2>
          <div className="flex flex-wrap gap-2">
            {relatedGames.map(({ name, path }) => (
              <Link key={name} href={path} className="badge badge-neutral bg-surface-elevated">
                {name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
