/**
 * Circuit — "Upcoming" homepage section: the next DRAFT/OPEN/LIVE
 * tournaments by start date (DRAFT shows as "Announced" with its
 * registration-open date), in the shared TournamentCard, swipeable below
 * lg via CardCarousel. Also reused on game pages.
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
          <p className="text-sm text-muted">Nothing on the calendar yet.</p>
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
