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
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Trophy, Swords, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { findGameBySlug, realGameNames } from "@/lib/games";
import { gameStandings } from "@/lib/standings";
import { buildMetadata, gamePath } from "@/lib/seo";
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

  const [active, completedCount, prizeSum, standings, allNames] = await Promise.all([
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
  ]);

  return {
    game,
    active,
    completedCount,
    totalPrize: prizeSum._sum.prizeAmount ?? 0,
    standings: standings.slice(0, 5),
    relatedGames: allNames.filter((n) => n !== game).slice(0, 6),
  };
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getGamePageData(slug);
  if (!data) return buildMetadata({ title: "Game not found", description: "", path: `/games/${slug}`, noindex: true });

  const { game, active, standings } = data;
  const description =
    active.length > 0
      ? `${active.length} open ${game} tournament${active.length === 1 ? "" : "s"} on Circuit right now. Register, compete, and climb the ${game} leaderboard.`
      : `Real ${game} tournaments and 1v1 Challenges on Circuit — Nigeria-first esports competitions with real prizes.${standings.length ? ` See the current ${game} leaderboard.` : ""}`;

  return buildMetadata({
    title: `${game} Tournaments & Esports Competitions`,
    description,
    path: gamePath(game),
  });
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getGamePageData(slug);
  if (!data) notFound();

  const { game, active, completedCount, totalPrize, standings, relatedGames } = data;
  const openNow = active.filter((t) => t.status === "OPEN" || t.status === "LIVE");
  const announced = active.filter((t) => t.status === "DRAFT");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-6 sm:p-8">
      <div
        data-surface="dark"
        className="relative flex min-h-[180px] w-full flex-col justify-end overflow-hidden rounded-[16px] border border-border p-6 sm:p-8"
      >
        <GameArtTile game={game} fill hideLabel imgWidth={1200} />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundImage: "linear-gradient(0deg, var(--background) 15%, transparent 70%)" }}
        />
        <div className="relative z-10 flex flex-col gap-2">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {game} Tournaments
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

      {standings.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-section-heading">{game} Leaderboard</h2>
          <div className="flex flex-col gap-2">
            {standings.map((s, i) => (
              <Link key={s.userId} href={`/players/${s.handle}`} className="card-row flex items-center gap-3 p-3">
                <span className="w-5 shrink-0 text-center text-sm font-bold text-muted">{i + 1}</span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated text-xs font-semibold text-muted">
                  {s.displayName.slice(0, 1).toUpperCase()}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{s.displayName}</span>
                  <span className="text-metadata truncate">@{s.handle}</span>
                </div>
                <span className="shrink-0 text-xs font-semibold text-muted">
                  {s.wins}W – {s.losses}L
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {relatedGames.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-border pt-6">
          <h2 className="text-section-heading">Other Games on Circuit</h2>
          <div className="flex flex-wrap gap-2">
            {relatedGames.map((name) => (
              <Link key={name} href={gamePath(name)} className="badge badge-neutral bg-surface-elevated">
                {name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
