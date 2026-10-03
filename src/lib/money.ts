/**
 * Circuit — naira formatting helpers shared by cards and heroes. Amounts are
 * kobo everywhere in the app.
 */

/** Short for tight spaces: ₦2,500, ₦10K, ₦1.5M. Exact amounts live on the page you open. */
export function compactNaira(kobo: number): string {
  const naira = kobo / 100;
  if (naira >= 1_000_000) return `₦${+(naira / 1_000_000).toFixed(1)}M`;
  if (naira >= 10_000) return `₦${+(naira / 1_000).toFixed(naira >= 100_000 ? 0 : 1)}K`;
  return `₦${naira.toLocaleString("en-NG")}`;
}
