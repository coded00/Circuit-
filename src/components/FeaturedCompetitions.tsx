import Link from "next/link";
import { Calendar, Layers, ArrowRight } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { tournamentStatusInfo } from "@/components/StatusPill";

/**
 * Circuit — "Featured Competitions" homepage section. Tall editorial
 * poster-style cards (image top ~62%, light content below), not a
 * standard dashboard card — replaces the old right-rail
 * `FeaturedCompetition` rotator (still on disk, unwired) now that this
 * section covers the same ground in the main column. "Featured" is a
 * real, data-backed selection (a real prize pool), not an arbitrary pick
 * — see the query in page.tsx.
 *
 * Every value shown is a real tournament field. Two things the reference
 * design implied but Circuit doesn't track are deliberately left out
 * rather than invented: a team-size tag ("5v5") — `Tournament.format`
 * encodes bracket structure, not team size — and an end date — only
 * `startAt` exists, no date range.
 */

type Tournament = {
  id: string;
  name: string;
  game: string;
  status: string;
  format: string;
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
  return date.toLocaleDateString("en-NG", { month: "short", day: "numeric" }).toUpperCase();
}

function formatLabel(format: string): string {
  return format
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function CapacityBadge({ registered, cap }: { registered: number; cap: number }) {
  const remaining = cap - registered;
  const nearlyFull = cap > 0 && remaining > 0 && remaining / cap <= 0.2;
  const full = remaining <= 0;

  if (nearlyFull || full) {
    return (
      <span className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-full bg-accent-orange px-3 py-1.5 text-xs font-semibold text-white">
        {full ? "Full" : `${remaining} spot${remaining === 1 ? "" : "s"} left`}
      </span>
    );
  }
  return (
    <span className="absolute top-3 left-3 z-10 rounded-full bg-accent-volt px-3 py-1.5 text-xs font-semibold text-accent-volt-foreground">
      {registered} / {cap} players
    </span>
  );
}

function FeaturedCard({ tournament }: { tournament: Tournament }) {
  const registered = tournament._count.registrations;
  const cap = tournament.participantCap;
  const fillPct = cap > 0 ? Math.min(100, Math.round((registered / cap) * 100)) : 0;
  const status = tournamentStatusInfo(tournament.status);

  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className="group flex h-[430px] w-[280px] shrink-0 flex-col overflow-hidden rounded-[16px] border border-border bg-surface transition hover:-translate-y-0.5 sm:w-[300px]"
    >
      <div className="relative h-[245px] w-full shrink-0 overflow-hidden">
        <CapacityBadge registered={registered} cap={cap} />
        <div className="h-full w-full transition-transform duration-300 ease-out group-hover:scale-[1.03]">
          <GameArtTile game={tournament.game} className="h-full w-full" hideLabel />
        </div>
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-16"
          style={{ backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)" }}
        />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-eyebrow truncate">
            {status.label.toUpperCase()} · {tournament.game}
          </span>
          <span className="truncate font-display text-base leading-tight font-bold text-foreground">
            {tournament.name}
          </span>
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-strong uppercase">
              Prize Pool
            </span>
            <span className="font-display text-lg leading-tight font-semibold text-gold">
              {tournament.prizeAmount ? formatNaira(tournament.prizeAmount) : "Free entry"}
            </span>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <Calendar size={10} />
              {formatShortDate(tournament.startAt)}
            </span>
            <span className="flex items-center gap-1">
              <Layers size={10} />
              {formatLabel(tournament.format)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">
            {registered} / {cap} Players
          </span>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-surface-elevated">
            <div className="h-full rounded-full bg-accent-volt" style={{ width: `${fillPct}%` }} />
          </div>
        </div>

        <span className="btn-primary mt-auto flex w-full items-center justify-center gap-1.5 py-2 text-sm">
          Register Now
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

export function FeaturedCompetitions({ tournaments }: { tournaments: Tournament[] }) {
  if (tournaments.length === 0) return null;
  return (
    <section id="featured" className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-section-heading">Featured Competitions</h2>
        <Link href="/compete" className="text-xs font-medium text-accent-blue hover:underline">
          View All →
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tournaments.map((t) => (
          <FeaturedCard key={t.id} tournament={t} />
        ))}
      </div>
    </section>
  );
}
