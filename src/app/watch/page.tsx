/**
 * Circuit Watch: every tournament that's on now (or about to start) and has a stream, each one opening its own
 * hub of channels. Circuit doesn't host the video; it brings the streams together.
 */
import Link from "next/link";
import { Tv } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const metadata = { title: "Watch | Circuit", description: "Watch the game from every angle: live tournaments, every stream in one place." };

const hasStreams: Prisma.TournamentWhereInput = {
  OR: [{ streamUrl: { not: null } }, { registrations: { some: { status: "CONFIRMED", streamUrl: { not: null } } } }],
};
const select = {
  id: true,
  name: true,
  game: true,
  status: true,
  startAt: true,
  streamUrl: true,
  _count: { select: { registrations: { where: { status: "CONFIRMED" as const, streamUrl: { not: null } } } } },
} satisfies Prisma.TournamentSelect;

type Card = Prisma.TournamentGetPayload<{ select: typeof select }>;

function TournamentCard({ t, live }: { t: Card; live: boolean }) {
  const channels = (t.streamUrl ? 1 : 0) + t._count.registrations;
  return (
    <li>
      <Link href={`/tournaments/${t.id}/watch`} className="cut-lg flex h-full flex-col gap-2 border border-border bg-surface p-4 transition-colors [--cut-line:var(--border)] hover:border-border-hover">
        <span className="flex items-center gap-2 text-xs text-muted">
          {live ? <span className="cut-xs bg-danger/15 px-2 py-0.5 font-semibold tracking-wide text-danger uppercase">Live</span> : <span>Starts {t.startAt.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>}
          <span>{t.game}</span>
        </span>
        <span className="font-display text-xl leading-tight font-bold tracking-tight uppercase">{t.name}</span>
        <span className="mt-auto flex items-center justify-between pt-2 text-sm">
          <span className="text-muted">{channels === 1 ? "1 channel" : `${channels} channels`}</span>
          <span className="flex items-center gap-1 font-semibold text-accent-volt">
            <Tv size={14} aria-hidden /> Watch
          </span>
        </span>
      </Link>
    </li>
  );
}

export default async function WatchPage() {
  const now = new Date();
  const [live, soon] = await Promise.all([
    prisma.tournament.findMany({ where: { status: "LIVE", ...hasStreams }, orderBy: { startAt: "desc" }, take: 24, select }),
    prisma.tournament.findMany({ where: { status: { in: ["OPEN", "CLOSED"] }, startAt: { gte: now, lte: new Date(now.getTime() + 48 * 3600_000) }, ...hasStreams }, orderBy: { startAt: "asc" }, take: 12, select }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-1">
        <span className="text-eyebrow text-accent-volt">Circuit Watch</span>
        <h1 className="font-display text-3xl leading-[1.05] font-bold tracking-tight uppercase sm:text-5xl">Watch the game from every angle</h1>
        <p className="max-w-xl text-sm text-muted">Pick a tournament, then switch between the main stage and every player&apos;s stream without leaving the page.</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-eyebrow text-muted">Live now</h2>
        {live.length === 0 ? (
          <div className="card state-block">
            <Tv size={32} className="text-muted" aria-hidden />
            <h3 className="state-title">Nothing live right now</h3>
            <p className="state-description">Tournaments with a stream show up here while they&apos;re being played.</p>
            <Link href="/compete" className="btn-secondary">
              Browse tournaments
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">{live.map((t) => <TournamentCard key={t.id} t={t} live />)}</ul>
        )}
      </section>

      {soon.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-eyebrow text-muted">Starting soon</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">{soon.map((t) => <TournamentCard key={t.id} t={t} live={false} />)}</ul>
        </section>
      )}
    </div>
  );
}
