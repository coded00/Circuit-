/**
 * Circuit — when a switched-on template runs. Pure (no database), so the rules for "is this template due, and for which
 * day" are tested without a clock or a sweep.
 *
 * A template that is ON runs on its chosen weekdays, in Lagos time. For each day it produces exactly one challenge, and
 * only while that day's entries are still open: a template switched on at 17:00 gets today's challenge, one switched on
 * at 19:00 waits for tomorrow rather than publishing a challenge nobody can enter. Running it twice for the same day is
 * harmless — the database refuses the second one — but this module is what says it should not be attempted.
 */

import { DEFAULT_DAY, lagosHour } from "@/lib/challengeTemplates";

const LAGOS_OFFSET_MS = 3_600_000;

/** 0 = Sunday … 6 = Saturday, on the Lagos calendar. */
export function lagosWeekday(at: Date): number {
  return new Date(at.getTime() + LAGOS_OFFSET_MS).getUTCDay();
}

/** The Lagos calendar date of an instant, as YYYY-MM-DD. This is the idempotency key for "this template, this day". */
export function lagosDateKey(at: Date): string {
  return new Date(at.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Every day", "Mon, Wed, Fri". */
export function describeWeekdays(days: readonly number[]): string {
  const set = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (set.length === 7) return "Every day";
  if (set.length === 0) return "No days";
  return set.map((d) => WEEKDAY_NAMES[d]).join(", ");
}

/** A weekday list from untrusted input: whole numbers 0–6, no duplicates, in order. Null if anything is off. */
export function parseWeekdays(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const days = raw.map((d) => (typeof d === "string" && d.trim() !== "" ? Number(d) : d));
  if (days.some((d) => typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6)) return null;
  return [...new Set(days as number[])].sort((a, b) => a - b);
}

export type DueDecision = { due: true; dateKey: string } | { due: false; reason: "OFF" | "NOT_TODAY" | "ENTRIES_CLOSED" | "ALREADY_LAUNCHED" };

/**
 * Should this template launch now? `launchedOn` is the date key it last launched for, if any.
 */
export function templateDue(opts: { enabled: boolean; weekdays: readonly number[]; launchedOn: string | null; now: Date }): DueDecision {
  if (!opts.enabled) return { due: false, reason: "OFF" };
  if (!opts.weekdays.includes(lagosWeekday(opts.now))) return { due: false, reason: "NOT_TODAY" };
  const dateKey = lagosDateKey(opts.now);
  if (opts.launchedOn === dateKey) return { due: false, reason: "ALREADY_LAUNCHED" };
  // Entries for today's challenge close at a fixed hour; past that there is nothing left to open.
  if (opts.now.getTime() >= lagosHour(opts.now, DEFAULT_DAY.entryClosesHour).getTime()) return { due: false, reason: "ENTRIES_CLOSED" };
  return { due: true, dateKey };
}
