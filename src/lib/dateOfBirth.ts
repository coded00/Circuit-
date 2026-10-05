/**
 * Circuit — the date of birth behind the age gate (paid entries, staking, withdrawals, buying). It is write-once:
 * a player can set it if it is empty, but cannot change or clear it afterwards, or the age gate would be
 * something anyone could step around by typing a different year. If it is wrong, staff correct it (with a reason
 * that is recorded) from the admin user page.
 */

export const MIN_AGE_PLAUSIBLE_YEARS = 130;

export function parseDateOfBirth(value: unknown): { ok: true; date: Date } | { ok: false } {
  if (typeof value !== "string") return { ok: false };
  const date = new Date(value);
  const now = new Date();
  if (Number.isNaN(date.getTime()) || date > now || date < new Date(now.getFullYear() - MIN_AGE_PLAUSIBLE_YEARS, now.getMonth(), now.getDate())) return { ok: false };
  return { ok: true, date };
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export type DobChange = { kind: "unchanged" } | { kind: "set"; date: Date } | { kind: "locked" } | { kind: "invalid" };

/** What a player's request to set their date of birth amounts to, given what is already on file. */
export function resolveDobChange(current: Date | null, requested: unknown): DobChange {
  const empty = requested === null || requested === "";
  if (empty) return current ? { kind: "locked" } : { kind: "unchanged" };
  const parsed = parseDateOfBirth(requested);
  if (!parsed.ok) return { kind: "invalid" };
  if (!current) return { kind: "set", date: parsed.date };
  return day(parsed.date) === day(current) ? { kind: "unchanged" } : { kind: "locked" };
}
