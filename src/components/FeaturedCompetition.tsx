"use client";

/**
 * Circuit — "Featured Competition" right-rail card (Phase 5 of the
 * CIRCUIT UI spec). Rotates through a handful of Circuit's real upcoming/
 * live tournaments — same real data as the old single-tournament "Next
 * Tournament" card this replaced, just a rotating spotlight instead of a
 * single static pick. "CIRCUIT CHAMPIONSHIP" is a static category label
 * (not a real tournament tier Circuit tracks); "Global" is a static
 * descriptor, not a measured region field — neither is fabricated *data*,
 * just decorative framing around real tournament fields.
 *
 * Uses `useSpotlight` directly (not the SpotlightCarousel wrapper) since
 * this card has real text content and a button below the image — the
 * wrapper's fixed bottom-corner overlay would land on top of "Register
 * Now" instead of on the image where it belongs. Dots sit in the seam
 * between image and text instead.
 *
 * Manual-only (`autoAdvance: false`): only LiveOnCircuit's featured
 * stream auto-rotates (the page's hero-level carousel) — every other
 * carousel, this one included, advances on click only.
 */

import Link from "next/link";
import { Calendar, Users, Globe2, ChevronLeft, ChevronRight } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { useSpotlight } from "@/lib/useSpotlight";

type Tournament = {
  id: string;
  name: string;
  game: string;
  entryFee: number;
  participantCap: number;
  startAt: Date;
  prizeAmount: number | null;
  _count: { registrations: number };
};

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" });
}

export function FeaturedCompetition({ tournaments }: { tournaments: Tournament[] }) {
  const slides = tournaments.slice(0, 4);
  const { index, next, prev, goTo, pause, resume } = useSpotlight(slides.length, { autoAdvance: false });

  if (slides.length === 0) return null;
  const tournament = slides[index];

  return (
    <div
      className="card overflow-hidden p-0"
      role="region"
      aria-label="Featured competition"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <div className="flex items-center justify-between px-4 pt-4">
        <span className="text-eyebrow">Featured Competition</span>
        <Link href="/battles" className="text-xs font-medium text-brand-blue hover:underline">
          View All
        </Link>
      </div>

      <div className="relative mt-3 h-28 w-full">
        <GameArtTile game={tournament.game} className="h-full w-full" />
        {slides.length > 1 && (
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous competition"
              className="rounded-full border border-white/20 bg-black/40 p-1 text-white backdrop-blur transition hover:bg-black/60"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next competition"
              className="rounded-full border border-white/20 bg-black/40 p-1 text-white backdrop-blur transition hover:bg-black/60"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        )}
      </div>

      {slides.length > 1 && (
        <div className="flex justify-center gap-1.5 pt-2.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to competition ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-brand-blue" : "w-1.5 bg-surface-elevated"}`}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-eyebrow text-brand-violet">Circuit Championship</span>
          <span className="text-card-title font-semibold">{tournament.name}</span>
        </div>

        <div className="flex flex-col">
          <span className="text-stat text-2xl text-gold">
            {tournament.prizeAmount ? formatNaira(tournament.prizeAmount) : formatNaira(tournament.entryFee)}
          </span>
          <span className="text-metadata">{tournament.prizeAmount ? "Prize Pool" : "Entry Fee"}</span>
        </div>

        <div className="flex flex-col gap-1.5 text-metadata">
          <span className="flex items-center gap-1.5">
            <Calendar size={12} />
            {formatDate(tournament.startAt)}
          </span>
          <span className="flex items-center gap-1.5">
            <Users size={12} />
            {tournament._count.registrations}/{tournament.participantCap} Players
          </span>
          <span className="flex items-center gap-1.5">
            <Globe2 size={12} />
            Global
          </span>
        </div>

        <Link href={`/tournaments/${tournament.id}`} className="btn-primary w-full">
          Register Now
        </Link>
      </div>
    </div>
  );
}
