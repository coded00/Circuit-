/**
 * Circuit — "Featured Competitions": prize-backed OPEN/LIVE tournaments
 * (see getFeaturedTournaments in src/app/page.tsx), in the shared
 * TournamentCard, swipeable below lg via CardCarousel. Reused by
 * /calendar and game pages with their own heading.
 */

import { CardCarousel } from "@/components/CardCarousel";
import { TournamentCard, type TournamentCardData } from "@/components/TournamentCard";
import { SectionHeader } from "@/components/ui/SectionHeader";

export function FeaturedCompetitions({
  tournaments,
  title = "Featured Competitions",
  viewAllHref = "/compete",
  anchorId = "featured",
  showFeaturedBadge = false,
}: {
  tournaments: TournamentCardData[];
  /** Lets `/calendar` reuse this exact card system under its own
   *  "Featured This Month" heading instead of duplicating the card. */
  title?: string;
  viewAllHref?: string;
  anchorId?: string;
  /** Small "Featured" tag on each card — off on the homepage (the heading
   *  already says it); `/calendar` turns it on. */
  showFeaturedBadge?: boolean;
}) {
  if (tournaments.length === 0) return null;
  return (
    <section id={anchorId} className="flex scroll-mt-20 flex-col gap-4">
      <SectionHeader title={title} href={viewAllHref} />
      <CardCarousel label={title}>
        {tournaments.map((t) => (
          <TournamentCard key={t.id} tournament={t} featured={showFeaturedBadge} />
        ))}
      </CardCarousel>
    </section>
  );
}
