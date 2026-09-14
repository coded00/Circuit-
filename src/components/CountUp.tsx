"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

function subscribeReducedMotion(callback: () => void) {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

/**
 * Animates a real, already-known number counting up on mount — presentation
 * only, never a stand-in for data that hasn't loaded (pass the real value,
 * not a placeholder). Respects prefers-reduced-motion by rendering the final
 * value straight away instead of animating.
 */
export function CountUp({ value, durationMs = 700 }: { value: number; durationMs?: number }) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const el = ref.current;
    if (!el) return;
    let frame: number;
    let start: number | null = null;

    function tick(now: number) {
      if (start === null) start = now;
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      // Direct DOM write, not React state — a rAF loop driving setState
      // every frame re-renders the whole subtree 60x/sec for no reason.
      el!.textContent = String(Math.round(eased * value));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reducedMotion]);

  return <span ref={ref}>{reducedMotion ? value : 0}</span>;
}
