/**
 * Circuit — how a team's prize is shared between its players.
 *
 * A team entry wins as one, but each roster player is paid their own share
 * straight to their own account. The captain sets the split before entering
 * (equal by default) and it's fixed once the entry is confirmed. Shares are
 * kept in basis points (10,000 = 100%) so a three-way equal split is exact
 * enough to add up: 34% / 33% / 33%, never "33.33…%".
 *
 * Pure functions (no database) so the registration form can use them too.
 */

export const FULL_SHARE_BP = 10_000;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Equal split of 100% across `count` players; the odd basis points go to the first (the captain). */
export function equalBasisPoints(count: number): number[] {
  if (count <= 0) return [];
  const each = Math.floor(FULL_SHARE_BP / count);
  const shares = Array<number>(count).fill(each);
  shares[0] += FULL_SHARE_BP - each * count;
  return shares;
}

/** 3334 → "33.34". Trailing zeros dropped: 2500 → "25". */
export const basisPointsToPercent = (bp: number): string => String(Number((bp / 100).toFixed(2)));

/**
 * The captain's typed percentages (by user id) → basis points. Nothing typed
 * (`undefined`) means an equal split. Every player needs a share above zero
 * and the total must be 100%.
 */
export function parseTeamShares(
  userIds: readonly string[],
  captainId: string,
  input: Readonly<Record<string, unknown>> | undefined
): Result<Record<string, number>> {
  const ordered = [captainId, ...userIds.filter((id) => id !== captainId)];
  if (!input || Object.values(input).every((v) => v === undefined || v === null || v === "")) {
    const equal = equalBasisPoints(ordered.length);
    return { ok: true, value: Object.fromEntries(ordered.map((id, i) => [id, equal[i]])) };
  }
  const out: Record<string, number> = {};
  for (const id of ordered) {
    const n = Number(input[id]);
    if (!Number.isFinite(n) || n <= 0 || n > 100) return { ok: false, error: "Every player needs a prize share above 0% and up to 100%." };
    out[id] = Math.round(n * 100);
  }
  const total = Object.values(out).reduce((a, b) => a + b, 0);
  // A hair off (two decimals of rounding) is settled on the captain; anything more is an error.
  if (Math.abs(total - FULL_SHARE_BP) > ordered.length) {
    return { ok: false, error: `The prize shares add up to ${basisPointsToPercent(total)}%. They need to make 100%.` };
  }
  out[captainId] += FULL_SHARE_BP - total;
  return { ok: true, value: out };
}

/** Divides `amount` (kobo) by basis-point shares. Whole kobo each; the leftover goes to the first player. */
export function splitByBasisPoints<T extends { userId: string; bp: number }>(amount: number, shares: readonly T[]): { userId: string; amount: number }[] {
  const parts = shares.map((s) => ({ userId: s.userId, amount: Math.floor((amount * s.bp) / FULL_SHARE_BP) }));
  const left = amount - parts.reduce((a, p) => a + p.amount, 0);
  if (parts[0]) parts[0].amount += left;
  return parts;
}
