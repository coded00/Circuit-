/**
 * Circuit — naira formatting helpers shared by cards and heroes, and the one bound that comes from the
 * database rather than from policy. Amounts are kobo everywhere in the app.
 */

/** Short for tight spaces: ₦2,500, ₦10K, ₦1.5M. Exact amounts live on the page you open. */
export function compactNaira(kobo: number): string {
  const naira = kobo / 100;
  if (naira >= 1_000_000) return `₦${+(naira / 1_000_000).toFixed(1)}M`;
  if (naira >= 10_000) return `₦${+(naira / 1_000).toFixed(naira >= 100_000 ? 0 : 1)}K`;
  return `₦${naira.toLocaleString("en-NG")}`;
}

/**
 * Every kobo-valued column in this schema is a Prisma `Int`, which is a PostgreSQL INT4 topping out at
 * 2,147,483,647 — ₦21,474,836.47. A number above that is not a value the column can hold, so a route
 * that "validates" it and lets it through does not reject it; it reaches Prisma and comes back as a
 * conversion error, i.e. a 500 from the route whose entire job was saying no.
 *
 * That is not hypothetical. The settings route's four kobo ceilings all read 100,000,000,000 until
 * finding #3 of the security audit turned it up. They now share this.
 *
 * ₦20,000,000 is round, safely inside INT4, and far above any real figure here — the largest default
 * setting is ₦1,000,000, a single Battle stake caps at ₦100,000, and the sponsored-prize ceiling
 * defaults to ₦5,000,000.
 */
export const MAX_KOBO_COLUMN = 2_000_000_000;
