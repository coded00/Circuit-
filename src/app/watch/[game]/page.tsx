/**
 * Circuit Watch for one game (/watch/call-of-duty-mobile): the live broadcasts, the ones coming up, and recent ones.
 * The video stays on whichever platform hosts it; this page is where someone looking for a game's streams starts.
 * Indexed once the game has two streamed tournaments; before that it still works, as noindex.
 */
import { cache } from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { Tv } from "lucide-react";
import { prisma } from "@/lib/db";
import { findGameBySlug } from "@/lib/games";
import { canonicalGamePath, displayGameName, gameSeoForName } from "@/lib/gameSeo";
import { PUBLIC_TOURNAMENT_STATUSES } from "@/lib/competitionCard";
import { buildMetadata, tournamentPath } from "@/lib/seo";
import { safeJsonLd } from "@/lib/jsonLd";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { GuideRow, OnAir, hasStreams, watchSelect } from "@/components/watch/WatchCards";

const MIN_STREAMED_FOR_INDEX = 2;

const load = cache(async (slug: string) => {
  const game = await findGameBySlug(slug);
  if (!game) return null;
  const base = { game, ...hasStreams };
  const now = new Date();
  const [streamed, live, soon, past] = await Promise.all([
    prisma.tournament.count({ where: { ...base, status: { in: [...PUBLIC_TOURNAMENT_STATUSES] } } }),
    prisma.tournament.findMany({ where: { ...base, status: "LIVE" }, orderBy: { startAt: "desc" }, take: 12, select: watchSelect }),
    prisma.tournament.findMany({ where: { ...base, status: { in: ["OPEN", "CLOSED"] }, startAt: { gte: now } }, orderBy: { startAt: "asc" }, take: 12, select: watchSelect }),
    prisma.tournament.findMany({ where: { ...base, status: "COMPLETE" }, orderBy: { startAt: "desc" }, take: 8, select: { id: true, name: true, startAt: true } }),
  ]);
  if (streamed === 0) return null;
  const gamePath = await canonicalGamePath(game);
  return {
    game,
    displayName: displayGameName(game, await gameSeoForName(game)),
    gamePath,
    slug: gamePath.replace("/games/", ""),
    streamed,
    live,
    soon,
    past,
    indexable: streamed >= MIN_STREAMED_FOR_INDEX,
  };
});

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  const { game: slug } = await params;
  const data = await load(slug);
  if (!data) return buildMetadata({ title: "Nothing to watch", description: "", path: `/watch/${slug}`, noindex: true });
  return buildMetadata({
    title: `Watch ${data.displayName} Tournaments Live`,
    description: `Watch ${data.displayName} tournaments on Circuit: live broadcasts, the next streams and recent ones, with every channel of a tournament in one place.`,
    path: `/watch/${data.slug}`,
    noindex: !data.indexable,
  });
}

export default async function GameWatchPage({ params }: { params: Promise<{ game: string }> }) {
  const { game: slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  if (slug !== data.slug) permanentRedirect(`/watch/${data.slug}`);
  const [featured, ...otherLive] = data.live;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Watch", path: "/watch" }, { name: data.displayName, path: `/watch/${data.slug}` }])),
        }}
      />
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-[1.05] font-bold tracking-tight uppercase sm:text-5xl">Watch {data.displayName} Tournaments</h1>
        <p className="text-sm text-muted">
          Every stream of a tournament in one place.{" "}
          <Link href={data.gamePath} className="text-accent-volt hover:underline">
            {data.displayName} tournaments
          </Link>{" "}
          ·{" "}
          <Link href={`/leaderboard/${data.slug}`} className="text-accent-volt hover:underline">
            Leaderboard
          </Link>
        </p>
      </header>

      {featured ? (
        <OnAir t={featured} />
      ) : (
        <div className="card state-block">
          <Tv size={32} className="text-muted" aria-hidden />
          <h2 className="state-title">Nothing on air right now</h2>
          <p className="state-description">{data.soon.length > 0 ? "The next broadcasts are lined up below." : "Streams show up here while a tournament is being played."}</p>
        </div>
      )}

      {(otherLive.length > 0 || data.soon.length > 0) && (
        <section aria-label="Guide">
          <h2 className="mb-1 border-b border-border pb-2 font-display text-sm font-bold tracking-wide uppercase">Guide</h2>
          <ul className="divide-y divide-border">
            {otherLive.map((t) => (
              <GuideRow key={t.id} t={t} live />
            ))}
            {data.soon.map((t) => (
              <GuideRow key={t.id} t={t} />
            ))}
          </ul>
        </section>
      )}

      {data.past.length > 0 && (
        <section aria-label="Recent broadcasts">
          <h2 className="mb-1 border-b border-border pb-2 font-display text-sm font-bold tracking-wide uppercase">Recent broadcasts</h2>
          <ul className="divide-y divide-border">
            {data.past.map((t) => (
              <li key={t.id}>
                <Link href={tournamentPath(t)} className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:text-accent-volt">
                  <span className="min-w-0 truncate font-medium">{t.name}</span>
                  <span className="shrink-0 text-xs text-muted">{t.startAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
