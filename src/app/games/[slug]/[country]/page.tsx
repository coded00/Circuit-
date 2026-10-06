/**
 * Circuit — one game's tournaments in one country (/games/call-of-duty-mobile/nigeria). Indexed once there are three
 * public tournaments of that game from that country; below that it still works, as noindex. A game or country that
 * has no tournaments together has no page.
 */
import { cache } from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { findGameBySlug } from "@/lib/games";
import { canonicalGamePath, displayGameName, gameSeoForName } from "@/lib/gameSeo";
import { countryName, flagEmoji } from "@/lib/countries";
import { countryFromSlug, countrySlug } from "@/lib/countrySeo";
import { competitionCardSelect, PUBLIC_TOURNAMENT_STATUSES } from "@/lib/competitionCard";
import { buildMetadata, tournamentPath } from "@/lib/seo";
import { safeJsonLd } from "@/lib/jsonLd";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { gameCountryIsIndexable } from "@/lib/seoEligibility";
import { FeaturedCompetitions } from "@/components/FeaturedCompetitions";

const load = cache(async (gameSlug: string, countrySlugParam: string) => {
  const game = await findGameBySlug(gameSlug);
  const code = countryFromSlug(countrySlugParam);
  if (!game || !code) return null;
  const where = { game, country: code, status: { in: [...PUBLIC_TOURNAMENT_STATUSES] } };
  const [publicTournaments, active, recent] = await Promise.all([
    prisma.tournament.count({ where }),
    prisma.tournament.findMany({ where: { game, country: code, status: { in: ["OPEN", "LIVE"] } }, orderBy: { startAt: "asc" }, take: 12, select: competitionCardSelect }),
    prisma.tournament.findMany({
      where: { game, country: code, status: "COMPLETE" },
      orderBy: { startAt: "desc" },
      take: 8,
      select: { id: true, name: true, startAt: true, _count: { select: { registrations: { where: { status: "CONFIRMED" } } } } },
    }),
  ]);
  if (publicTournaments === 0) return null;
  const gamePath = await canonicalGamePath(game);
  return {
    game,
    displayName: displayGameName(game, await gameSeoForName(game)),
    gamePath,
    gameSlug: gamePath.replace("/games/", ""),
    code,
    country: countryName(code),
    countrySlug: countrySlug(code),
    publicTournaments,
    active,
    recent,
    indexable: gameCountryIsIndexable(publicTournaments),
  };
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string; country: string }> }): Promise<Metadata> {
  const { slug, country } = await params;
  const data = await load(slug, country);
  if (!data) return buildMetadata({ title: "Page not found", description: "", path: `/games/${slug}/${country}`, noindex: true });
  return buildMetadata({
    title: `${data.displayName} Tournaments in ${data.country}`,
    description: `${data.publicTournaments} ${data.displayName} tournament${data.publicTournaments === 1 ? "" : "s"} from ${data.country} on Circuit. Register, compete and see the results.`,
    path: `${data.gamePath}/${data.countrySlug}`,
    noindex: !data.indexable,
  });
}

export default async function GameCountryPage({ params }: { params: Promise<{ slug: string; country: string }> }) {
  const { slug, country } = await params;
  const data = await load(slug, country);
  if (!data) notFound();
  if (slug !== data.gameSlug) permanentRedirect(`${data.gamePath}/${data.countrySlug}`);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Tournaments", path: "/compete" },
              { name: data.displayName, path: data.gamePath },
              { name: data.country, path: `${data.gamePath}/${data.countrySlug}` },
            ]),
          ),
        }}
      />
      <header className="flex flex-col gap-2 border-b border-border pb-5">
        <h1 className="font-display text-3xl leading-[1.05] font-bold tracking-tight uppercase sm:text-4xl">
          <span aria-hidden className="mr-2">{flagEmoji(data.code)}</span>
          {data.displayName} Tournaments in {data.country}
        </h1>
        <p className="text-sm text-muted">
          <Link href={data.gamePath} className="text-accent-volt hover:underline">All {data.displayName} tournaments</Link> ·{" "}
          <Link href={`/countries/${data.countrySlug}`} className="text-accent-volt hover:underline">All tournaments in {data.country}</Link>
        </p>
      </header>

      {data.active.length > 0 ? (
        <FeaturedCompetitions tournaments={data.active} title={`Open ${data.game} tournaments in ${data.country}`} viewAllHref={`/compete?game=${encodeURIComponent(data.game)}`} />
      ) : (
        <div className="card flex flex-col items-center gap-2 py-10 text-center">
          <Trophy size={24} className="text-muted" />
          <p className="text-sm text-muted">
            No open {data.game} tournaments from {data.country} right now.
          </p>
        </div>
      )}

      {data.recent.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-section-heading">Recent results</h2>
          <ul className="divide-y divide-border border-y border-border">
            {data.recent.map((t) => (
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
        </section>
      )}
    </div>
  );
}
