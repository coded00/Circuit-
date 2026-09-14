/**
 * Circuit — the real "starting soon" window, shared between a Server
 * Component (deciding whether to render the badge at all) and the client
 * <CountdownTimer> (deciding what to tick). Kept out of CountdownTimer.tsx
 * itself because that file is "use client" — every export from a client
 * module is a client reference, and Next.js's RSC bundler refuses to let a
 * Server Component call one directly, even a plain pure function.
 */

// One hour — the real window this app calls "starting soon." Exported so
// callers decide whether to render the countdown at all from the same real
// threshold, rather than each guessing their own number.
export const STARTING_SOON_WINDOW_MS = 60 * 60 * 1000;

export function isStartingSoon(target: Date, now: Date = new Date()): boolean {
  const remaining = target.getTime() - now.getTime();
  return remaining > 0 && remaining <= STARTING_SOON_WINDOW_MS;
}
