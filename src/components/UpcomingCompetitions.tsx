import Link from "next/link";
import { ArrowRight, Calendar, Swords, Users } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";

/**
 * Circuit — "Upcoming Competitions" homepage section. A static grid, not
 * a carousel — same card proportions (`aspect-[4/3]` image, same grid
 * breakpoints) as `FeaturedCompetitions` right above it, so the two
 * sections read as one consistent card system rather than two different
 * shapes. Every value shown is a real Tournament field (see the query in
 * page.tsx), including `teamSize` — the organizer-set players-per-side
 * for that specific competition (e.g. Call of Duty Mobile runs 5v5 in
 * ranked multiplayer but solo/duo in Tournament Mode, so it's a property
 * of the tournament, not the game).
 */

type Tournament = {
  id: string;
  name: string;
  game: string;
  status: string;
  format: string;
  teamSize: string;
  entryFee: number;
  participantCap: number;
  startAt: Date;
  prizeAmount: number | null;
  _count: { registrations: number };
};

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { month: "short", day: "numeric" });
}

function UpcomingCard({ tournament }: { tournament: Tournament }) {
  const status = tournamentStatusInfo(tournament.status);
  const registered = tournament._count.registrations;

  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className="group flex h-full w-full flex-col overflow-hidden rounded-[16px] border border-border bg-surface transition hover:-translate-y-0.5"
    >
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden">
        <GameArtTile game={tournament.game} className="h-full w-full" hideLabel imgWidth={500} />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-16"
          style={{ backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)" }}
        />
        <span className="absolute top-3 left-3 z-10 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
          {tournament.game}
        </span>
        <div className="absolute top-3 right-3 z-10">
          <StatusPill tone={status.tone} pulse={status.pulse}>
            {status.label}
          </StatusPill>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <span className="truncate font-display text-base leading-tight font-bold text-foreground">
          {tournament.name}
        </span>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <Calendar size={11} />
            {formatShortDate(tournament.startAt)}
          </span>
          <span className="flex items-center gap-1">
            <Swords size={11} />
            {tournament.teamSize}
          </span>
          <span className="flex items-center gap-1">
            <Users size={11} />
            {registered} / {tournament.participantCap} Players
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-strong uppercase">
            {tournament.prizeAmount ? "Prize Pool" : tournament.entryFee === 0 ? "Entry" : "Entry Fee"}
          </span>
          <span className="font-display text-lg leading-tight font-semibold text-gold">
            {tournament.prizeAmount
              ? formatNaira(tournament.prizeAmount)
              : tournament.entryFee === 0
                ? "Free entry"
                : formatNaira(tournament.entryFee)}
          </span>
        </div>

        <span className="btn-primary mt-auto flex w-full items-center justify-center gap-1.5 py-2.5 text-sm">
          Register Now
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

export function UpcomingCompetitions({ tournaments }: { tournaments: Tournament[] }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-section-heading flex items-center gap-2">
            <Calendar size={17} className="text-accent-blue" />
            Upcoming Competitions
          </h2>
          <p className="text-metadata">Join the next wave of tournaments and put your skills to the test.</p>
        </div>
        <Link href="/compete" className="text-xs font-medium text-accent-blue hover:underline">
          View All Competitions →
        </Link>
      </div>
      <div className="border-b border-border" />
      {tournaments.length === 0 ? (
        <div className="card flex flex-col items-center gap-1 py-10 text-center">
          <p className="text-sm text-muted">Nothing upcoming right now — be the first.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((t) => (
            <UpcomingCard key={t.id} tournament={t} />
          ))}
        </div>
      )}
    </section>
  );
}
