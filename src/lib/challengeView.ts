/**
 * Circuit — small view helpers for the open-challenge cards: how long ago a
 * challenge went up, the pot a stake makes, and a challenger's record in the
 * game. Pure and unit-tested.
 */

/** "just now", "3 min ago", "2 hr ago", "4 days ago". */
export function timeAgo(date: Date, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - date.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** Both players stake the same amount and the winner takes the lot. */
export const potOf = (stakeKobo: number): number => stakeKobo * 2;

/** Whole-percent win rate, or null when they have no finished matches. */
export function winRate(wins: number, losses: number): number | null {
  const played = wins + losses;
  return played === 0 ? null : Math.round((wins / played) * 100);
}

/** Key for a player's record in one game. */
export const recordKey = (game: string, userId: string): string => `${game}|${userId}`;

/** A stable 0-359 hue for a handle, so a player's placeholder avatar is always the same colour. */
export function avatarHue(handle: string): number {
  let hash = 0;
  for (let i = 0; i < handle.length; i++) hash = (hash * 31 + handle.charCodeAt(i)) >>> 0;
  return hash % 360;
}

/** Posted within the last ten minutes: worth a small "live" cue on the card. */
export const isFresh = (date: Date, now = Date.now()): boolean => now - date.getTime() < 10 * 60_000;

export type ChallengerTier = { label: string; tone: "strong" | "solid" | "other" };

/**
 * A plain-words read of a challenger's record in the game, so nobody has to
 * do the sums: "Hard to beat" is earned (70% or better over at least ten
 * matches); fewer than five matches is "Just getting started", not a verdict.
 */
export function challengerTier(wins: number, losses: number): ChallengerTier {
  const played = wins + losses;
  const rate = winRate(wins, losses);
  if (rate === null) return { label: "No record yet", tone: "other" };
  if (played < 5) return { label: "Just getting started", tone: "other" };
  if (rate >= 70 && played >= 10) return { label: "Hard to beat", tone: "strong" };
  if (rate >= 55) return { label: "Solid record", tone: "solid" };
  return { label: "Still climbing", tone: "other" };
}
