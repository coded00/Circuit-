"use client";

/**
 * Circuit — horizontal carousel row. Used by ExploreTheCircuit,
 * CompeteOnCircuit, and the discover feed's tournament/battle rows:
 * scroll-snap row of fixed-width cards with manual arrow nav. This
 * replaced an older, separate bare-markup CardCarousel that duplicated
 * the same job with none of the polish (no arrows styling, no edge
 * fade) — one carousel component, used everywhere a row of cards
 * scrolls horizontally. Manual-only, by explicit product decision — only
 * LiveOnCircuit's featured stream (the homepage's hero-level carousel)
 * auto-rotates; every other carousel, this row included, advances on
 * click only.
 *
 * Index-based (not raw pixel math): advancing means scrolling the next
 * item into view via `scrollIntoView`, which works regardless of each
 * card's actual width and makes looping back to the start trivial (just
 * wrap the index).
 *
 * Edge fade: every card is genuinely the same size (verified directly in
 * the DOM — this was reported as a "cards aren't the same size" bug, but
 * the actual cause is the last visible card getting cut off mid-card by
 * the row's own edge, which reads as a size difference even though it
 * isn't one). The fade masks make that edge read as a deliberate "more to
 * scroll" hint instead of a rough cutoff, and only show on the side that
 * actually has more content, tracked via scroll position.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function AutoScrollRow({
  items,
  ariaLabel,
  showDots = false,
}: {
  items: React.ReactNode[];
  ariaLabel: string;
  /** Dot pagination below the row, in addition to the hover arrows —
   *  off by default so existing callers (ExploreTheCircuit,
   *  OpenChallenges) keep their current look. */
  showDots?: boolean;
}) {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const count = items.length;

  function goTo(next: number) {
    const wrapped = ((next % count) + count) % count;
    setIndex(wrapped);
    itemRefs.current[wrapped]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    function update() {
      if (!el) return;
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      resizeObserver.disconnect();
    };
  }, [count]);

  return (
    <div className="flex flex-col gap-3">
    <div className="group relative" role="region" aria-label={ariaLabel}>
      <div
        ref={scrollerRef}
        className="scrollbar-hide flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
      >
        {items.map((item, i) => (
          <div key={i} ref={(el) => { itemRefs.current[i] = el; }} className="shrink-0 snap-start">
            {item}
          </div>
        ))}
      </div>

      {/* Edge fades — pointer-events-none so they never block clicks on
          the cards underneath, only shown on a side with more content. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent transition-opacity ${
          canScrollLeft ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent transition-opacity ${
          canScrollRight ? "opacity-100" : "opacity-0"
        }`}
      />

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            aria-label="Previous"
            className="btn-icon absolute top-1/2 -left-3 hidden -translate-y-1/2 bg-surface opacity-0 shadow-lg transition group-hover:opacity-100 sm:flex"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            aria-label="Next"
            className="btn-icon absolute top-1/2 -right-3 hidden -translate-y-1/2 bg-surface opacity-0 shadow-lg transition group-hover:opacity-100 sm:flex"
          >
            <ChevronRight size={16} />
          </button>
        </>
      )}
    </div>
    {showDots && count > 1 && (
      <div className="flex items-center justify-center gap-1.5" role="tablist" aria-label={`${ariaLabel} pages`}>
        {items.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Go to item ${i + 1}`}
            onClick={() => goTo(i)}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-accent-volt" : "w-1.5 bg-border-strong"}`}
          />
        ))}
      </div>
    )}
    </div>
  );
}
