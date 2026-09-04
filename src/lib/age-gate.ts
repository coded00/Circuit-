/**
 * Circuit — age gate (Build Plan task P0-3).
 *
 * A single reusable check that every cash-touching action calls before it
 * completes: paid registration, Battle accept (once staked Battles exist,
 * post-V1), and payout claim. Maps to ACC-3 and TRU-5.
 *
 * Deliberately NOT wired into browsing, the Battle board, or any read path —
 * TRU-5 requires that general browsing stays available to an underage
 * account. Call `assertAgeGate` only at the specific write actions that move
 * money.
 */

export const MINIMUM_AGE_YEARS = 18;

export class AgeGateError extends Error {
  code: "MISSING_DOB" | "UNDERAGE";

  constructor(code: "MISSING_DOB" | "UNDERAGE", message: string) {
    super(message);
    this.code = code;
    this.name = "AgeGateError";
  }
}

export function calculateAge(dateOfBirth: Date, asOf: Date = new Date()): number {
  let age = asOf.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = asOf.getMonth() - dateOfBirth.getMonth();
  const dayDiff = asOf.getDate() - dateOfBirth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

export function isOldEnough(
  dateOfBirth: Date | null | undefined,
  asOf: Date = new Date()
): boolean {
  if (!dateOfBirth) return false;
  return calculateAge(dateOfBirth, asOf) >= MINIMUM_AGE_YEARS;
}

/**
 * Throws AgeGateError if the account can't be verified as old enough.
 * Call this at the top of every cash-touching action (paid registration,
 * payout claim) — never at a browsing or discovery route.
 */
export function assertAgeGate(dateOfBirth: Date | null | undefined): void {
  if (!dateOfBirth) {
    throw new AgeGateError(
      "MISSING_DOB",
      "Date of birth is required before this action can complete."
    );
  }
  if (!isOldEnough(dateOfBirth)) {
    throw new AgeGateError(
      "UNDERAGE",
      `This action requires an account age of ${MINIMUM_AGE_YEARS}+.`
    );
  }
}
