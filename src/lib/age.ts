/**
 * Circuit — date-of-birth rules at signup. 13 is the minimum to hold an
 * account; the separate 18+ rule for money (paid entry, prize payouts)
 * still lives in src/lib/age-gate.ts and is unchanged.
 */

import { calculateAge } from "@/lib/age-gate";

export const MIN_SIGNUP_AGE = 13;

/** Parses "YYYY-MM-DD" and checks it's a real, plausible birth date at least MIN_SIGNUP_AGE ago. */
export function parseSignupDateOfBirth(value: unknown): { ok: true; date: Date } | { ok: false; error: string } {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, error: "Enter your date of birth." };
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { ok: false, error: "That date doesn't exist." };
  }
  const age = calculateAge(new Date(y, m - 1, d));
  if (age < 0 || age > 120) return { ok: false, error: "Enter your real date of birth." };
  if (age < MIN_SIGNUP_AGE) return { ok: false, error: `You need to be at least ${MIN_SIGNUP_AGE} to join Circuit.` };
  return { ok: true, date };
}
