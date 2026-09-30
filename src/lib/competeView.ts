/**
 * Circuit — small view helpers for the Compete page: what kind of
 * competition something is, how long until it closes, and the filter groups.
 * Kept out of the page component so time-based text is computed here (the
 * page itself stays pure) and so the rules can be unit-tested.
 */

import { getStructure } from "@/lib/competitionStructures";

/** "Bracket", "League table" and "Lobby" groups players actually think in. */
export const TYPE_GROUPS = [
  { value: "bracket", label: "Brackets", formats: ["KNOCKOUT", "DOUBLE_ELIMINATION"] },
  { value: "table", label: "League tables", formats: ["LEAGUE", "ROUND_ROBIN", "SWISS"] },
  { value: "lobby", label: "Lobby points", formats: ["LOBBY_POINTS"] },
] as const;

export type TypeGroupValue = (typeof TYPE_GROUPS)[number]["value"];

export function formatsForType(value: string | undefined): readonly string[] | null {
  return TYPE_GROUPS.find((g) => g.value === value)?.formats ?? null;
}

/** "League, home and away", "Single elimination", "Lobby points". */
export function competitionKind(t: { format: string; leagueLegs?: number | null }): string {
  const label = getStructure(t.format)?.label ?? t.format;
  return t.format === "LEAGUE" && t.leagueLegs === 2 ? `${label}, home and away` : label;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long until `date`, in words ("2 days", "5 hours", "40 minutes"); null once it has passed. */
export function timeUntil(date: Date, now = Date.now()): { text: string; urgent: boolean } | null {
  const ms = date.getTime() - now;
  if (ms <= 0) return null;
  const urgent = ms < DAY;
  if (ms >= 2 * DAY) return { text: `${Math.floor(ms / DAY)} days`, urgent };
  if (ms >= DAY) return { text: "1 day", urgent };
  if (ms >= 2 * HOUR) return { text: `${Math.floor(ms / HOUR)} hours`, urgent };
  if (ms >= HOUR) return { text: "1 hour", urgent };
  return { text: `${Math.max(1, Math.floor(ms / MINUTE))} minutes`, urgent };
}

type Featurable = { status: string; prizeAmount: number | null; startAt: Date; registered: number };

/**
 * The one competition worth leading with: something live (the busiest first),
 * otherwise the open one with the biggest prize, soonest breaking ties.
 */
export function pickFeatured<T extends Featurable>(list: readonly T[]): T | null {
  const live = list.filter((t) => t.status === "LIVE").sort((a, b) => b.registered - a.registered);
  if (live[0]) return live[0];
  const open = list.filter((t) => t.status === "OPEN").sort((a, b) => (b.prizeAmount ?? 0) - (a.prizeAmount ?? 0) || a.startAt.getTime() - b.startAt.getTime());
  return open[0] ?? null;
}

/** "3 spots left", "Last spot", "Full". */
export function spotsLabel(registered: number, cap: number): { text: string; tight: boolean } {
  const left = Math.max(0, cap - registered);
  if (left === 0) return { text: "Full", tight: true };
  if (left === 1) return { text: "Last spot", tight: true };
  return { text: `${left} spots left`, tight: left <= Math.ceil(cap * 0.2) };
}
