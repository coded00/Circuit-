/**
 * Circuit — "Upcoming" homepage section: tournaments that are announced but
 * not open to enter yet (DRAFT shows as "Announced" with the date
 * registration opens), plus any whose registration has closed ahead of the
 * start, soonest first, in the shared TournamentCard, swipeable below lg via
 * CardCarousel. Open and live tournaments are Featured, not here. Also
 * reused on game pages, which pass their own list.
 */

import Link from "next/link";
import { CardCarousel } from "@/components/CardCarousel";
import { TournamentCard, type TournamentCardData } from "@/components/TournamentCard";
import { SectionHeader } from "@/components/ui/SectionHeader";

export function UpcomingCompetitions({ tournaments }: { tournaments: TournamentCardData[] }) {
  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title="Upcoming" href="/compete" />
      {tournaments.length === 0 ? (
        <div className="card flex flex-col items-start gap-3">
          <p className="text-sm text-muted">Nothing announced yet. Tournaments appear here before registration opens.</p>
          <Link href="/tournaments/new" className="btn-secondary">
            Host a tournament
          </Link>
        </div>
      ) : (
        <CardCarousel label="Upcoming competitions">
          {tournaments.map((t) => (
            <TournamentCard key={t.id} tournament={t} />
          ))}
        </CardCarousel>
      )}
    </section>
  );
}
