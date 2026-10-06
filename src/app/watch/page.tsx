/**
 * Circuit Watch: every tournament that's on now (or about to start) and has a stream, each one opening its own
 * hub of channels. Circuit doesn't host the video; it brings the streams together.
 */
import Link from "next/link";
import { Tv } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { GameArtTile } from "@/components/GameArtTile";

export const metadata = buildMetadata({
  title: "Watch Live Gaming Tournaments",
  description: "Watch gaming tournaments live. Every stream of a tournament in one place, from the main stage to each player.",
  path: "/watch",
});

const hasStreams: Prisma.TournamentWhereInput = {
  OR: [
    { streamUrl: { not: null } },
    {
      registrations: {
        some: { status: "CONFIRMED", streamUrl: { not: null } },
      },
    },
  ],
};
const select = {
  id: true,
  name: true,
  game: true,
  status: true,
  startAt: true,
  posterUrl: true,
  streamUrl: true,
  _count: {
    select: {
      registrations: {
        where: { status: "CONFIRMED" as const, streamUrl: { not: null } },
      },
    },
  },
} satisfies Prisma.TournamentSelect;

type Card = Prisma.TournamentGetPayload<{ select: typeof select }>;

const when = (d: Date) =>
  d.toLocaleString("en-NG", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
const channelsOf = (t: Card) => (t.streamUrl ? 1 : 0) + t._count.registrations;
const channelLabel = (n: number) => (n === 1 ? "1 channel" : `${n} channels`);

/** The tournament being played: big, with its own art behind it. */
function OnAir({ t }: { t: Card }) {
  return (
    <Link
      href={`/tournaments/${t.id}/watch`}
      className="group relative block aspect-[4/3] w-full cut-lg bg-surface [--cut-line:var(--border)] sm:aspect-[21/9]"
    >
      <GameArtTile game={t.game} posterUrl={t.posterUrl} fill hideLabel imgWidth={1280} />
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/10"
      />
      <span className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-4 sm:p-6">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-white/70">
            <span className="mr-2 cut-xs bg-danger px-2 py-0.5 font-bold tracking-wide text-white uppercase">
              On air
            </span>
            {t.game} · {channelLabel(channelsOf(t))}
          </span>
          <span className="font-display text-2xl leading-[1.05] font-bold tracking-tight text-white uppercase sm:text-4xl">
            {t.name}
          </span>
        </span>
        <span className="btn-primary watch-attn">
          <span className="watch-dot" aria-hidden /> Watch now
        </span>
      </span>
    </Link>
  );
}

/** One line of the guide: when, what, how many channels. */
function GuideRow({ t, live }: { t: Card; live?: boolean }) {
  return (
    <li>
      <Link
        href={`/tournaments/${t.id}/watch`}
        className="flex items-center gap-4 py-3 transition-colors hover:bg-surface sm:px-2"
      >
        <span
          className={`w-20 shrink-0 font-mono text-sm tabular-nums ${live ? "font-bold text-danger" : "text-muted"}`}
        >
          {live ? "ON AIR" : when(t.startAt)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-display text-base font-bold tracking-tight uppercase">
            {t.name}
          </span>
          <span className="truncate text-xs text-muted">
            {t.game} · {channelLabel(channelsOf(t))}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-accent-volt">
          Watch
        </span>
      </Link>
    </li>
  );
}

export default async function WatchPage() {
  const now = new Date();
  const [live, soon] = await Promise.all([
    prisma.tournament.findMany({
      where: { status: "LIVE", ...hasStreams },
      orderBy: { startAt: "desc" },
      take: 24,
      select,
    }),
    prisma.tournament.findMany({
      where: {
        status: { in: ["OPEN", "CLOSED"] },
        startAt: { gte: now, lte: new Date(now.getTime() + 48 * 3600_000) },
        ...hasStreams,
      },
      orderBy: { startAt: "asc" },
      take: 12,
      select,
    }),
  ]);
  const [featured, ...otherLive] = live;

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
    </div>
  );
}
