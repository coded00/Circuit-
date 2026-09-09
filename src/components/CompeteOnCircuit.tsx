import Link from "next/link";
import { Calendar, Flame, Zap, Trophy } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { AutoScrollRow } from "@/components/AutoScrollRow";

/**
 * Circuit — "Compete on Circuit" homepage section (Phase 9 of the CIRCUIT
 * UI spec). Unlike the spec's own example card names ("The Arena Series"
 * etc — invented for the reference), this uses Circuit's real tournament
 * data throughout, same as Phase 5's Featured Competition: real
 * competitions already exist and fit every field the design calls for,
 * so there's nothing to fabricate here.
 *
 * The category badges (Featured Event / Open Circuit / Featured
 * Competition) are decorative labels with no dedicated Circuit field —
 * rather than assign them arbitrarily, they're derived from real
 * tournament state: OPEN registration gets "Open Circuit", a real prize
 * pool gets "Featured Competition"/"Featured Event", plain entry-fee
 * tournaments get no badge (matching the spec's own 4th example card,
 * which also has none).
 */

type Tournament = {
  id: string;
  name: string;
  game: string;
  format: string;
  status: string;
  entryFee: number;
  prizeAmount: number | null;
  startAt: Date;
};

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { month: "short", day: "numeric" });
}

function formatLabel(format: string): string {
  return format
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function CompetitionBadge({ tournament, index }: { tournament: Tournament; index: number }) {
  if (tournament.status === "OPEN") {
    return (
      <span className="badge badge-open absolute top-2 left-2 z-10">
        <Zap size={11} />
        Open Circuit
      </span>
    );
  }
  if (tournament.prizeAmount) {
    return (
      <span className="badge badge-brand absolute top-2 left-2 z-10">
        {index === 0 ? <Flame size={11} /> : <Trophy size={11} />}
        {index === 0 ? "Featured Event" : "Featured Competition"}
      </span>
    );
  }
  return null;
}

function CompetitionCard({ tournament, index }: { tournament: Tournament; index: number }) {
  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className="card-media card-hover group flex h-full w-64 flex-col transition-all duration-[220ms] ease-out"
    >
      <div className="relative h-24 w-full overflow-hidden">
        <CompetitionBadge tournament={tournament} index={index} />
        <div className="h-full w-full transition-transform duration-[220ms] ease-out group-hover:scale-[1.03]">
          <GameArtTile game={tournament.game} className="h-full w-full" />
        </div>
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
          <span>{formatLabel(tournament.format)}</span>
        </div>
      </div>
    </Link>
  );
}

export function CompeteOnCircuit({ tournaments }: { tournaments: Tournament[] }) {
  if (tournaments.length === 0) return null;

  const items = tournaments.slice(0, 8).map((t, i) => <CompetitionCard key={t.id} tournament={t} index={i} />);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-section-heading">Compete on Circuit</h2>
          <p className="text-metadata">Find your next challenge.</p>
        </div>
        <Link href="/battles" className="text-xs font-medium text-brand-blue hover:underline">
          View All →
        </Link>
      </div>

      <AutoScrollRow items={items} ariaLabel="Compete on Circuit — competitions" />
    </section>
  );
}
