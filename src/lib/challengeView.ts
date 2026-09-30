/**
 * Circuit — small view helpers for the open-challenge cards: how a stake
 * reads, how long ago a challenge went up, and which one to lead with.
 * Pure (time is passed in or read here, never in a component) and unit-tested.
 */

/** "₦5,000", "₦120,000", "₦1.5M": whole naira for normal stakes, millions shortened so a huge stake can't break a card. */
export function formatStake(kobo: number): string {
  const naira = kobo / 100;
  if (naira >= 1_000_000) {
    const m = naira / 1_000_000;
    return `₦${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  return `₦${naira.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

/** Both players stake the same amount and the winner takes the lot. */
export const potOf = (stakeKobo: number): number => stakeKobo * 2;

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

type Stakeable = { id: string; stakeAmount: number; createdAt: Date };

/**
 * The challenge worth a bigger card: the biggest purse, newest on a tie. Only
 * when there's a real stake and enough challenges that one stands out.
 */
export function pickBiggestPurse<T extends Stakeable>(list: readonly T[], minimum = 3): T | null {
  if (list.length < minimum) return null;
  const top = [...list].sort((a, b) => b.stakeAmount - a.stakeAmount || b.createdAt.getTime() - a.createdAt.getTime())[0];
  return top && top.stakeAmount > 0 ? top : null;
}
