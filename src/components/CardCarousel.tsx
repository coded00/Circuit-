"use client";

/**
 * Circuit — swipeable card row for phones and tablets, a plain grid on
 * desktop. Below `lg` the cards sit in one horizontal, snap-scrolling row
 * (one card + a peek of the next on phones, two + a peek on tablets), so
 * a section like Featured/Upcoming Competitions takes one screen-height
 * instead of a long vertical stack; position dots show where you are and
 * jump to a card when tapped. At `lg`+ it's the same 3-column grid these
 * sections always used.
 *
 * Native CSS scroll-snap, not a JS carousel library: the browser handles
 * swipe physics, momentum and keyboard/trackpad scrolling; this component
 * only tracks which card is in view for the dots.
 */

import { Children, useEffect, useRef, useState } from "react";

export function CardCarousel({ children, label }: { children: React.ReactNode; label: string }) {
  const items = Children.toArray(children);
  const rowRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const cards = Array.from(row.children) as HTMLElement[];
        if (cards.length === 0) return;
        // Scrolled to the very end: the last cards can't snap to the left
        // edge (nothing after them to scroll into), so call it the last one.
        if (row.scrollLeft + row.clientWidth >= row.scrollWidth - 2) {
          setActive(cards.length - 1);
          return;
        }
        let nearest = 0;
        let best = Infinity;
        cards.forEach((card, i) => {
          const distance = Math.abs(card.offsetLeft - row.scrollLeft);
          if (distance < best) {
            best = distance;
            nearest = i;
          }
        });
        setActive(nearest);
      });
    };
    row.addEventListener("scroll", update, { passive: true });
    return () => {
      row.removeEventListener("scroll", update);
      cancelAnimationFrame(frame);
    };
  }, []);

  function goTo(index: number) {
    const row = rowRef.current;
    const card = row?.children[index] as HTMLElement | undefined;
    if (!row || !card) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollTo({ left: card.offsetLeft, behavior: reduceMotion ? "auto" : "smooth" });
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={rowRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        tabIndex={0}
        // `relative` makes each card's offsetLeft relative to this row.
        // py-1/-my-1 leaves room for the cards' hover lift, which an
        // overflow-x container would otherwise clip at the top.
        className="scrollbar-hide relative -my-1 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain py-1 focus-visible:outline-none lg:my-0 lg:grid lg:snap-none lg:grid-cols-3 lg:overflow-visible lg:py-0"
      >
        {items.map((child, i) => (
          <div
            key={i}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${items.length}`}
            className="w-[85%] shrink-0 snap-start sm:w-[46%] lg:w-auto"
          >
            {child}
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 lg:hidden">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show ${i + 1} of ${items.length}`}
              aria-current={i === active ? "true" : undefined}
              className="flex h-6 items-center justify-center px-0.5"
            >
              <span
                className={`block h-1.5 rounded-full transition-all duration-[var(--duration-base)] ease-[var(--ease-standard)] ${
                  i === active ? "w-5 bg-accent-volt" : "w-1.5 bg-border-strong"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
