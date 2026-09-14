/**
 * Circuit — `/calendar` date utilities. Pure functions only, no Prisma
 * here. Local `Date` getters throughout (server's own time zone) — what
 * matters is that the month grid's cell dates and the date-bucket key
 * events are grouped under use the exact same method, not that either
 * pins a specific IANA zone (this is a browse view, not a scheduling
 * system that promises a wall-clock guarantee).
 */

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" bucket key, local calendar day. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses a "YYYY-MM-DD" key back into a local Date at midnight. Falls
 *  back to today for anything malformed rather than throwing. */
export function parseDateKey(key: string | undefined): Date {
  if (key && /^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const [y, m, d] = key.split("-").map(Number);
    const parsed = new Date(y, m - 1, d);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}

/** Normalizes (year, 1-indexed month + delta) into a valid {year, month}. */
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = month - 1 + delta;
  const y = year + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  return { year: y, month: m + 1 };
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

/** Full 6-row (42-day) month grid: the Sunday on/before the 1st through
 *  the Saturday on/after the last day of the month, so every row is a
 *  complete week and leading/trailing days from adjacent months fill the
 *  corners (the caller renders those dimmed). */
export function getMonthGridDays(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month - 1, 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

/** 7-day week (Sun-Sat) containing `anchor`. */
export function getWeekDays(anchor: Date): Date[] {
  const start = new Date(anchor);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}
