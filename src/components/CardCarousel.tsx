"use client";

/**
 * Circuit — horizontal scroll-snap carousel (NEXA reference: Featured
 * Tournaments' fixed-width card row). Native scroll + snap, arrow buttons
 * just nudge scrollLeft — no carousel library, keeps this cheap on the
 * mid-range-Android/3G target NFR-1 cares about.
 */

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function CardCarousel({ children }: { children: React.ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollByAmount(direction: 1 | -1) {
    scrollerRef.current?.scrollBy({ left: direction * 300, behavior: "smooth" });
  }

  return (
    <div className="group relative">
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <button
        type="button"
        onClick={() => scrollByAmount(-1)}
        aria-label="Scroll left"
        className="absolute top-1/2 -left-3 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface p-1.5 opacity-0 shadow-lg transition group-hover:opacity-100 sm:flex"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        onClick={() => scrollByAmount(1)}
        aria-label="Scroll right"
        className="absolute top-1/2 -right-3 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface p-1.5 opacity-0 shadow-lg transition group-hover:opacity-100 sm:flex"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
