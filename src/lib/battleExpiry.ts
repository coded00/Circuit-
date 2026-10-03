/**
 * Circuit — the pure rules for when an unaccepted Challenge lapses. Kept
 * apart from src/lib/battles.ts (which touches the database) so the
 * create-challenge form, a client component, can use the same numbers.
 */

/** What the creator can choose, in hours. */
export const BATTLE_EXPIRY_OPTIONS = [
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
] as const;
export const DEFAULT_BATTLE_EXPIRY_HOURS = 72;
/** Challenges made before expiry existed lapse this long after they were created. */
export const LEGACY_EXPIRY_HOURS = 168;

export function parseExpiryHours(value: unknown): number | null {
  const hours = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : DEFAULT_BATTLE_EXPIRY_HOURS;
  return BATTLE_EXPIRY_OPTIONS.some((o) => o.hours === hours) ? hours : null;
}

export function battleExpiresAt(battle: { createdAt: Date; expiresAt: Date | null }): Date {
  return battle.expiresAt ?? new Date(battle.createdAt.getTime() + LEGACY_EXPIRY_HOURS * 60 * 60 * 1000);
}

