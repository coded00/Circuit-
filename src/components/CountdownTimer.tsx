"use client";

import { useSyncExternalStore } from "react";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** MM:SS once under an hour (the only window this component is ever
 *  shown in — see isStartingSoon in tournamentTiming.ts), HH:MM:SS
 *  otherwise as a safety margin against a stale server render still
 *  landing just over an hour. */
function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

// The ticking clock as an external store, same pattern CountUp.tsx
// already uses for prefers-reduced-motion — a setInterval driving React's
// own re-render scheduling via useSyncExternalStore, rather than a
// useEffect calling setState directly (which cascades an extra render
// and is what the react-hooks/set-state-in-effect rule flags).
function subscribeToClock(callback: () => void) {
  const interval = setInterval(callback, 1000);
  return () => clearInterval(interval);
}

function getClockSnapshot(): number {
  return Date.now();
}

// A real Date.now() is never 0 — used as the "not mounted yet" sentinel
// so the server render and the client's pre-hydration render both show
// nothing, matching exactly (no hydration mismatch), until the real
// ticking value takes over.
function getClockServerSnapshot(): number {
  return 0;
}

/**
 * A real, ticking countdown to a real Date — no placeholder digits.
 */
export function CountdownTimer({
  target,
  zeroLabel = "Starting now",
}: {
  target: string;
  /** What to show once the countdown hits zero — defaults to the
   *  original "a real thing is about to start" wording; a caller
   *  counting down to something else (e.g. an auto-resolve deadline)
   *  can supply its own. */
  zeroLabel?: string;
}) {
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getClockServerSnapshot);
  if (now === 0) return null;

  const remaining = new Date(target).getTime() - now;
  return <span className="font-mono tabular-nums">{remaining <= 0 ? zeroLabel : formatRemaining(remaining)}</span>;
}
