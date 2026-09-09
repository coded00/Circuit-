"use client";

/**
 * Circuit — single-large-item auto-rotating carousel, for slides that are
 * one uninterrupted image (arrows/dots overlay its bottom corners
 * directly). For slides with real content below the image (text, a
 * button — see FeaturedCompetition), use `useSpotlight` directly instead
 * and render controls wherever they actually fit.
 *
 * This is the only auto-rotating carousel on the page (LiveOnCircuit's
 * featured stream, the homepage's hero-level visual) — per explicit
 * product decision, every other carousel is manual-only.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSpotlight } from "@/lib/useSpotlight";

export function SpotlightCarousel({ items, ariaLabel }: { items: React.ReactNode[]; ariaLabel: string }) {
  const { index, next, prev, goTo, pause, resume } = useSpotlight(items.length);
  const count = items.length;

  if (count === 0) return null;

  return (
    <div className="relative" role="region" aria-label={ariaLabel} onMouseEnter={pause} onMouseLeave={resume} onFocus={pause} onBlur={resume}>
      {items[index]}

      {count > 1 && (
        <>
          <div className="absolute right-3 bottom-3 z-20 flex gap-1.5">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous"
              className="rounded-full border border-white/20 bg-black/40 p-1.5 text-white backdrop-blur transition hover:bg-black/60"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next"
              className="rounded-full border border-white/20 bg-black/40 p-1.5 text-white backdrop-blur transition hover:bg-black/60"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="absolute bottom-3 left-3 z-20 flex gap-1.5">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to item ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/40"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
