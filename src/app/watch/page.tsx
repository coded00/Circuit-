/**
 * Circuit Watch: every tournament that's on now (or about to start) and has a stream, each one opening its own
 * hub of channels. Circuit doesn't host the video; it brings the streams together.
 */
import Link from "next/link";
import { Tv } from "lucide-react";
import { prisma } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { canonicalGamePath } from "@/lib/gameSeo";
import { GuideRow, OnAir, hasStreams, watchSelect } from "@/components/watch/WatchCards";

export const metadata = buildMetadata({
  title: "Watch Live Gaming Tournaments",
  description: "Watch gaming tournaments live. Every stream of a tournament in one place, from the main stage to each player.",
  path: "/watch",
});

export default async function WatchPage() {
  const now = new Date();
  const [live, soon, gameRows] = await Promise.all([
    prisma.tournament.findMany({
      where: { status: "LIVE", ...hasStreams },
      orderBy: { startAt: "desc" },
      take: 24,
      select: watchSelect,
    }),
    prisma.tournament.findMany({
      where: {
        status: { in: ["OPEN", "CLOSED"] },
        startAt: { gte: now, lte: new Date(now.getTime() + 48 * 3600_000) },
        ...hasStreams,
      },
      orderBy: { startAt: "asc" },
      take: 12,
      select: watchSelect,
    }),
    prisma.tournament.groupBy({ by: ["game"], where: { status: { in: ["OPEN", "CLOSED", "LIVE", "COMPLETE"] }, ...hasStreams }, _count: { _all: true }, orderBy: { _count: { game: "desc" } }, take: 12 }),
  ]);
  const [featured, ...otherLive] = live;
  const gameLinks = await Promise.all(gameRows.map(async (g) => ({ name: g.game, path: `/watch/${(await canonicalGamePath(g.game)).replace("/games/", "")}` })));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-[1.05] font-bold tracking-tight uppercase sm:text-5xl">
          Watch the game from every angle
        </h1>
        <p className="max-w-xl text-sm text-muted">
          Every stream of a tournament in one place. Switch between the main
          stage and each player without leaving the page.
        </p>
      </header>

      {featured ? (
        <OnAir t={featured} />
      ) : (
        <div className="card state-block">
          <Tv size={32} className="text-muted" aria-hidden />
          <h2 className="state-title">Nothing on air right now</h2>
          <p className="state-description">
            {soon.length > 0
              ? "The next broadcasts are lined up below."
              : "Tournaments with a stream show up here while they're being played."}
          </p>
          <Link href="/compete" className="btn-secondary">
            Browse tournaments
          </Link>
        </div>
      )}

      {(otherLive.length > 0 || soon.length > 0) && (
        <section aria-label="Guide">
          <h2 className="mb-1 border-b border-border pb-2 font-display text-sm font-bold tracking-wide uppercase">
            Guide
          </h2>
          <ul className="divide-y divide-border">
            {otherLive.map((t) => (
              <GuideRow key={t.id} t={t} live />
            ))}
            {soon.map((t) => (
              <GuideRow key={t.id} t={t} />
            ))}
          </ul>
        </section>
      )}

      {gameLinks.length > 0 && (
        <section aria-label="Watch by game">
          <h2 className="mb-2 border-b border-border pb-2 font-display text-sm font-bold tracking-wide uppercase">Watch by game</h2>
          <ul className="flex flex-wrap gap-2">
            {gameLinks.map((g) => (
              <li key={g.name}>
                <Link href={g.path} className="badge badge-neutral bg-surface-elevated">
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
