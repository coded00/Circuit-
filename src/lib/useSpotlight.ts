"use client";

import { useEffect, useState } from "react";

/**
 * Circuit — headless auto-rotation state for a single-large-item
 * carousel. Deliberately renders nothing itself: SpotlightCarousel's
 * first version overlaid its own arrow/dot controls at a fixed corner,
 * which only works when the whole slide is one uninterrupted image (as
 * in LiveOnCircuit's featured stream). FeaturedCompetition's card has
 * real text content and a button below its image — a fixed bottom-right
 * overlay would land on top of that content — so each caller renders its
 * own controls wherever they actually fit, using this hook for the
 * shared timing/pause/loop logic only.
 *
 * `autoAdvance` defaults to true for LiveOnCircuit's featured stream —
 * the page's one hero-level carousel, and per explicit product decision
 * the only section that auto-rotates at all. FeaturedCompetition passes
 * `autoAdvance: false` to stay manual-only (arrows/dots still work).
 */
const AUTO_ADVANCE_MS = 6000;

export function useSpotlight(
  count: number,
  { intervalMs = AUTO_ADVANCE_MS, autoAdvance = true }: { intervalMs?: number; autoAdvance?: boolean } = {},
) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (count <= 1 || !autoAdvance) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(timer);
  }, [count, paused, intervalMs, autoAdvance]);

  return {
    index,
    next: () => setIndex((i) => (i + 1) % count),
    prev: () => setIndex((i) => (i - 1 + count) % count),
    goTo: setIndex,
    pause: () => setPaused(true),
    resume: () => setPaused(false),
  };
}
