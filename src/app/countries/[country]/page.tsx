/**
 * Circuit — gaming tournaments in one country (/countries/nigeria). A tournament's country is its organizer's country.
 * Only real Circuit activity is shown, and no player names: just how many players are from the country. The page is
 * indexed once the country has three public tournaments and ten players (src/lib/seoEligibility.ts).
 */
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { countryName, flagEmoji } from "@/lib/countries";
import { countryFromSlug, countrySlug } from "@/lib/countrySeo";
import { competitionCardSelect, PUBLIC_TOURNAMENT_STATUSES } from "@/lib/competitionCard";
import { canonicalGamePath } from "@/lib/gameSeo";
import { buildMetadata, tournamentPath } from "@/lib/seo";
import { safeJsonLd } from "@/lib/jsonLd";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { countryIsIndexable } from "@/lib/seoEligibility";
import { FeaturedCompetitions } from "@/components/FeaturedCompetitions";

const load = cache(async (slug: string) => {
  const code = countryFromSlug(slug);
  if (!code) return null;
  const where = { country: code, status: { in: [...PUBLIC_TOURNAMENT_STATUSES] } };
  const [publicTournaments, players, active, recent, games] = await Promise.all([
    prisma.tournament.count({ where }),
    prisma.user.count({ where: { country: code } }),
    prisma.tournament.findMany({ where: { country: code, status: { in: ["OPEN", "LIVE"] } }, orderBy: { startAt: "asc" }, take: 12, select: competitionCardSelect }),
    prisma.tournament.findMany({
      where: { country: code, status: "COMPLETE" },
      orderBy: { startAt: "desc" },
      take: 8,
      select: { id: true, name: true, game: true, startAt: true, _count: { select: { registrations: { where: { status: "CONFIRMED" } } } } },
    }),
    prisma.tournament.groupBy({ by: ["game"], where, _count: { _all: true }, orderBy: { _count: { game: "desc" } } }),
  ]);
  if (publicTournaments === 0) return null; // a country with no tournaments has no page
  return { code, name: countryName(code), publicTournaments, players, active, recent, games, indexable: countryIsIndexable({ publicTournaments, players }) };
});

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const { country: slug } = await params;
  const data = await load(slug);
  if (!data) return buildMetadata({ title: "Country not found", description: "", path: `/countries/${slug}`, noindex: true });
  return buildMetadata({
    title: `Gaming Tournaments in ${data.name}`,
    description: `Gaming tournaments and esports competitions in ${data.name} on Circuit: ${data.publicTournaments} tournament${data.publicTournaments === 1 ? "" : "s"}, ${data.players} player${data.players === 1 ? "" : "s"}. Register, compete and see the results.`,
    path: `/countries/${countrySlug(data.code)}`,
    noindex: !data.indexable,
  });
}

export default async function CountryPage({ params }: { params: Promise<{ country: string }> }) {
  const { country: slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const games = await Promise.all(data.games.map(async (g) => ({ name: g.game, count: g._count._all, path: `${await canonicalGamePath(g.game)}/${countrySlug(data.code)}` })));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Tournaments", path: "/compete" }, { name: data.name, path: `/countries/${countrySlug(data.code)}` }])),
        }}
      />
      <header className="flex flex-col gap-2 border-b border-border pb-5">
        <h1 className="font-display text-3xl leading-[1.05] font-bold tracking-tight uppercase sm:text-5xl">
          <span aria-hidden className="mr-2">{flagEmoji(data.code)}</span>Gaming Tournaments in {data.name}
        </h1>
        <p className="text-sm text-muted">
          {data.publicTournaments} tournament{data.publicTournaments === 1 ? "" : "s"} · {data.players} player{data.players === 1 ? "" : "s"} from {data.name} on Circuit
        </p>
      </header>

      {data.active.length > 0 ? (
        <FeaturedCompetitions tournaments={data.active} title={`Open in ${data.name}`} viewAllHref="/compete" />
      ) : (
        <div className="card flex flex-col items-center gap-2 py-10 text-center">
          <Trophy size={24} className="text-muted" />
          <p className="text-sm text-muted">No open tournaments from {data.name} right now.</p>
          <Link href="/compete" className="btn-secondary mt-1">
            Browse all tournaments
          </Link>
        </div>
      )}

      {games.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-section-heading">Games played in {data.name}</h2>
          <ul className="flex flex-wrap gap-2">
            {games.map((g) => (
              <li key={g.name}>
                <Link href={g.path} className="badge badge-neutral bg-surface-elevated">
                  {g.name} · {g.count}
                </Link>
              </li>
            ))}
          </ul>
        </section>
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
                    {t.game} · {t.startAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
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
