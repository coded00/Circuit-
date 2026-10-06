/**
 * Circuit — one game's leaderboard as a page of its own (/leaderboard/call-of-duty-mobile), the page people reach when
 * they search "<game> leaderboard". It lists the standings from completed challenges. It's indexed only once ten
 * players are ranked, and a player who hasn't made their profile public (or is under 18) shows as "Circuit player" to
 * signed-out visitors, which is what search engines are.
 */
import { cache } from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { findGameBySlug } from "@/lib/games";
import { canonicalGamePath, displayGameName, gameSeoForName } from "@/lib/gameSeo";
import { gameStandings } from "@/lib/standings";
import { getCurrentUser } from "@/lib/session";
import { buildMetadata } from "@/lib/seo";
import { safeJsonLd } from "@/lib/jsonLd";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { leaderboardIsIndexable } from "@/lib/seoEligibility";
import { standingsForViewer } from "@/lib/leaderboardSeo";

const SHOWN = 50;

const load = cache(async (slug: string) => {
  const game = await findGameBySlug(slug);
  if (!game) return null;
  const info = await gameSeoForName(game);
  const gamePath = await canonicalGamePath(game);
  const canonicalSlug = gamePath.replace("/games/", "");
  return { game, displayName: displayGameName(game, info), gamePath, canonicalSlug, standings: await gameStandings(game) };
});

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  const { game: slug } = await params;
  const data = await load(slug);
  if (!data) return buildMetadata({ title: "Leaderboard not found", description: "", path: `/leaderboard/${slug}`, noindex: true });
  return buildMetadata({
    title: `${data.displayName} Leaderboard: Top Players`,
    description: `The top ${data.displayName} players on Circuit, ranked by wins and losses from completed challenges.`,
    path: `/leaderboard/${data.canonicalSlug}`,
    noindex: !leaderboardIsIndexable(data.standings.length),
  });
}

export default async function GameLeaderboardPage({ params }: { params: Promise<{ game: string }> }) {
  const { game: slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  if (slug !== data.canonicalSlug) permanentRedirect(`/leaderboard/${data.canonicalSlug}`);

  const viewer = await getCurrentUser();
  const rows = await standingsForViewer(data.standings.slice(0, SHOWN), !!viewer);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Leaderboard", path: "/leaderboard" },
              { name: data.displayName, path: `/leaderboard/${data.canonicalSlug}` },
            ]),
          ),
        }}
      />
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-[1.05] font-bold tracking-tight uppercase sm:text-4xl">{data.displayName} Leaderboard</h1>
        <p className="text-sm text-muted">
          Ranked by wins in completed challenges. <Link href={data.gamePath} className="text-accent-volt hover:underline">{data.displayName} tournaments</Link>
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="card state-block">
          <h2 className="state-title">No ranked players yet</h2>
          <p className="state-description">Play a {data.game} challenge and finish the match to appear here.</p>
          <Link href={`/battles?game=${encodeURIComponent(data.game)}`} className="btn-primary">
            Find a challenge
          </Link>
        </div>
      ) : (
        <ol className="divide-y divide-border border-y border-border">
          {rows.map((s) => {
            const body = (
              <>
                <span className="w-8 shrink-0 text-center font-mono text-lg font-bold text-muted">{s.rank}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{s.displayName}</span>
                  {s.handle && <span className="truncate text-xs text-muted">@{s.handle}</span>}
                </span>
                <span className="shrink-0 text-sm font-semibold text-muted">
                  {s.wins}W – {s.losses}L
                </span>
              </>
            );
            return (
              <li key={s.rank}>
                {s.handle ? (
                  <Link href={`/players/${s.handle}`} className="flex items-center gap-3 py-3 transition-colors hover:bg-surface">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
