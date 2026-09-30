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
