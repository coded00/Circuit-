"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function HeroCarousel({ slides }: { slides: React.ReactNode[] }) {
  const [index, setIndex] = useState(0);

  if (slides.length === 0) return null;

  function go(delta: number) {
    setIndex((i) => (i + delta + slides.length) % slides.length);
  }

  return (
    <div>
      {slides[index]}

      {slides.length > 1 && (
        <>
          <div>
            <button type="button" onClick={() => go(-1)} aria-label="Previous slide">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next slide">
              <ChevronRight size={16} />
            </button>
          </div>
          <div>
            {slides.map((_, i) => (
              <button key={i} type="button" onClick={() => setIndex(i)} aria-label={`Go to slide ${i + 1}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
