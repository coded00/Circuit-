/** Circuit Watch building blocks shared by /watch and the per-game watch pages: the stream filter, the card fields, the on-air hero and a guide row. */
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { GameArtTile } from "@/components/GameArtTile";

export const hasStreams: Prisma.TournamentWhereInput = {
  OR: [
    { streamUrl: { not: null } },
    {
      registrations: {
        some: { status: "CONFIRMED", streamUrl: { not: null } },
      },
    },
  ],
};
export const watchSelect = {
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

export type WatchCard = Prisma.TournamentGetPayload<{ select: typeof watchSelect }>;

const when = (d: Date) =>
  d.toLocaleString("en-NG", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
const channelsOf = (t: WatchCard) => (t.streamUrl ? 1 : 0) + t._count.registrations;
const channelLabel = (n: number) => (n === 1 ? "1 channel" : `${n} channels`);

/** The tournament being played: big, with its own art behind it. */
export function OnAir({ t }: { t: WatchCard }) {
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
export function GuideRow({ t, live }: { t: WatchCard; live?: boolean }) {
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

