import Link from "next/link";
import { Calendar, Swords, ArrowRight } from "lucide-react";
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
 * Every value shown is a real tournament field, including `teamSize` —
 * the organizer-set players-per-side for that specific competition
 * (e.g. Call of Duty Mobile runs 5v5 in ranked multiplayer but solo/duo
 * in Tournament Mode, so it's a property of the tournament, not the
 * game). One thing the reference design implied that Circuit still
 * doesn't track is left out rather than invented: an end date — only
 * `startAt` exists, no date range.
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
  return date.toLocaleDateString("en-NG", { month: "short", day: "numeric" }).toUpperCase();
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
    <span className="absolute top-3 left-3 z-10 rounded-full bg-accent-blue px-3 py-1.5 text-xs font-semibold text-white">
      {registered} / {cap} players
    </span>
  );
}

function FeaturedCard({ tournament, showFeaturedBadge = false }: { tournament: Tournament; showFeaturedBadge?: boolean }) {
  const registered = tournament._count.registrations;
  const cap = tournament.participantCap;
  const fillPct = cap > 0 ? Math.min(100, Math.round((registered / cap) * 100)) : 0;
  const status = tournamentStatusInfo(tournament.status);

  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className="group flex h-full w-full flex-col overflow-hidden rounded-[16px] border border-border bg-surface transition hover:-translate-y-0.5"
    >
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden">
        <CapacityBadge registered={registered} cap={cap} />
        {showFeaturedBadge && (
          <span className="absolute top-3 right-3 z-10 rounded-full bg-accent-volt px-3 py-1.5 text-xs font-semibold text-accent-volt-foreground">
            Featured
          </span>
        )}
        <div className="h-full w-full transition-transform duration-300 ease-out group-hover:scale-[1.03]">
          <GameArtTile game={tournament.game} className="h-full w-full" hideLabel />
        </div>
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-16"
          style={{ backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)" }}
        />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-eyebrow truncate">
            {status.label.toUpperCase()} · {tournament.game}
          </span>
          <span className="truncate font-display text-base leading-tight font-bold text-foreground">
            {tournament.name}
          </span>
        </div>

        <div className="flex items-start justify-between gap-2">
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
          <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <Calendar size={10} />
              {formatShortDate(tournament.startAt)}
            </span>
            <span className="flex items-center gap-1">
              <Swords size={10} />
              {tournament.teamSize}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted">
            {registered} / {cap} Players
          </span>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-surface-elevated">
            <div className="h-full rounded-full bg-accent-blue" style={{ width: `${fillPct}%` }} />
          </div>
        </div>

        <span className="btn-primary mt-auto flex w-full items-center justify-center gap-1.5 py-2.5 text-sm">
          Register Now
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

export function FeaturedCompetitions({
  tournaments,
  title = "Featured Competitions",
  viewAllHref = "/compete",
  anchorId = "featured",
  showFeaturedBadge = false,
}: {
  tournaments: Tournament[];
  /** Lets `/calendar` reuse this exact card system under its own
   *  "Featured This Month" heading instead of duplicating the card. */
  title?: string;
  viewAllHref?: string;
  anchorId?: string;
  /** Small "Featured" tag on each card — off by default (the homepage
   *  section heading already says "Featured", so the badge is redundant
   *  there); `/calendar` turns it on since the heading there says
   *  "Featured This Month" instead. */
  showFeaturedBadge?: boolean;
}) {
  if (tournaments.length === 0) return null;
  return (
    <section id={anchorId} className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-section-heading">{title}</h2>
        <Link href={viewAllHref} className="text-xs font-medium text-accent-blue hover:underline">
          View All →
        </Link>
      </div>
      <div className="border-b border-border" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tournaments.map((t) => (
          <FeaturedCard key={t.id} tournament={t} showFeaturedBadge={showFeaturedBadge} />
        ))}
      </div>
    </section>
  );
}
