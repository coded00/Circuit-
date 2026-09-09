/**
 * Circuit — Compete: the main tournament discovery/search page (MVP
 * rework spec section 18). Real, schema-backed filters only: search
 * (name/game text match), game, status (Open/Upcoming/Live/Completed —
 * reusing `tournamentStatusInfo`), and entry type (Free/Paid, via
 * `entryFee`). The spec's "Filter by Format: 1v1/Team/Battle Royale" is
 * intentionally omitted — Circuit's real `Tournament.format` field
 * encodes bracket structure (e.g. "single elimination"), not a
 * team-size taxonomy; there's no data to back that filter honestly.
 */

import Link from "next/link";
import { Calendar, Users, Tv } from "lucide-react";
import type { Prisma, TournamentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { GameArtTile } from "@/components/GameArtTile";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";

type SearchParams = {
  q?: string;
  game?: string;
  status?: string;
  entry?: string;
};

const STATUS_OPTIONS: { value: TournamentStatus | ""; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "OPEN", label: "Open" },
  { value: "LIVE", label: "Live" },
  { value: "COMPLETE", label: "Completed" },
];

const ENTRY_OPTIONS = [
  { value: "", label: "Any entry" },
  { value: "free", label: "Free" },
  { value: "paid", label: "Paid" },
] as const;

function formatDate(date: Date): string {
  return date.toLocaleString("en-NG", { dateStyle: "medium" });
}

function formatNaira(kobo: number): string {
  return `₦ ${(kobo / 100).toLocaleString("en-NG")}`;
}

export default async function CompetePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q, game, status, entry } = await searchParams;

  const where: Prisma.TournamentWhereInput = {};
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (game) where.game = { contains: game, mode: "insensitive" };
  if (status) where.status = status as TournamentStatus;
  if (entry === "free") where.entryFee = 0;
  if (entry === "paid") where.entryFee = { gt: 0 };

  const tournaments = await prisma.tournament.findMany({
    where,
    orderBy: { startAt: "asc" },
    take: 40,
    select: {
      id: true,
      name: true,
      game: true,
      status: true,
      format: true,
      entryFee: true,
      participantCap: true,
      streamUrl: true,
      startAt: true,
      prizeAmount: true,
      _count: { select: { registrations: { where: { status: "CONFIRMED" } } } },
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Compete</h1>
        <p className="text-sm text-muted">Search and filter every competition on Circuit.</p>
      </div>

      <form className="card flex flex-wrap items-end gap-3">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <label className="field-label" htmlFor="q">
            Search
          </label>
          <input id="q" type="text" name="q" defaultValue={q ?? ""} placeholder="Tournament name" className="field-input" />
        </div>
        <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
          <label className="field-label" htmlFor="game">
            Game
          </label>
          <input id="game" type="text" name="game" defaultValue={game ?? ""} placeholder="e.g. EA FC 26" className="field-input" />
        </div>
        <div className="flex min-w-[140px] flex-col gap-1.5">
          <label className="field-label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className="field-select">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-[140px] flex-col gap-1.5">
          <label className="field-label" htmlFor="entry">
            Entry
          </label>
          <select id="entry" name="entry" defaultValue={entry ?? ""} className="field-select">
            {ENTRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary">
          Apply
        </button>
        {(q || game || status || entry) && (
          <Link href="/compete" className="text-xs font-medium text-accent-blue hover:underline">
            Clear filters
          </Link>
        )}
      </form>

      {tournaments.length === 0 ? (
        <div className="card flex flex-col items-center gap-1 py-16 text-center">
          <p className="text-sm text-muted">No competitions match those filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tournaments.map((tournament) => {
            const statusInfo = tournamentStatusInfo(tournament.status);
            return (
              <Link
                key={tournament.id}
                href={`/tournaments/${tournament.id}`}
                className="card-media card-hover flex h-full flex-col"
              >
                <div className="relative h-28 w-full overflow-hidden">
                  <GameArtTile game={tournament.game} className="h-full w-full">
                    <span className="absolute top-2 left-2 z-10">
                      <StatusPill tone={statusInfo.tone} pulse={statusInfo.pulse}>
                        {statusInfo.label}
                      </StatusPill>
                    </span>
                  </GameArtTile>
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <span className="text-card-title truncate font-semibold">{tournament.name}</span>
                  <span className="truncate text-xs text-muted">{tournament.game}</span>
                  <span className="text-stat text-sm text-gold">
                    {tournament.prizeAmount
                      ? formatNaira(tournament.prizeAmount)
                      : tournament.entryFee === 0
                        ? "Free"
                        : formatNaira(tournament.entryFee)}
                  </span>
                  <div className="flex items-center justify-between text-metadata">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      {formatDate(tournament.startAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={11} />
                      {tournament._count.registrations}/{tournament.participantCap}
                      {tournament.streamUrl && <Tv size={11} />}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
