"use client";

/**
 * Circuit — hero carousel. One slide at a time (not a scroll-snap row
 * like CardCarousel — a hero carousel shows a single full-bleed slide),
 * arrow + dot navigation. Slide 0 is always the static brand pitch;
 * additional slides (built by the caller from real live-tournament data)
 * are optional and only appended when there's something real to show.
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function HeroCarousel({ slides }: { slides: React.ReactNode[] }) {
  const [index, setIndex] = useState(0);

  if (slides.length === 0) return null;

  function go(delta: number) {
    setIndex((i) => (i + delta + slides.length) % slides.length);
  }

  return (
    <div className="relative">
      {slides[index]}

      {slides.length > 1 && (
        <>
          {/* Both arrows grouped in the bottom-right corner, not split
              across left/right edges — slide content is left-aligned and
              vertically centered, so a left-edge arrow at mid-height
              reliably collides with the headline on any slide with a
              multi-line title. The bottom-right corner stays clear
              regardless of headline length/line count. */}
          <div className="absolute right-3 bottom-3 z-20 flex gap-1.5">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous slide"
              className="rounded-full border border-white/20 bg-black/40 p-1.5 text-white backdrop-blur transition hover:bg-black/60"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next slide"
              className="rounded-full border border-white/20 bg-black/40 p-1.5 text-white backdrop-blur transition hover:bg-black/60"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="absolute bottom-3 left-3 z-20 flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/40"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
