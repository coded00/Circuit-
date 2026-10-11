/**
 * Circuit — Daily Challenges in the words players use: what stage a challenge is at and which deadline matters
 * next. Pure, so the feed, the detail page and the tests all say the same thing. The database has twelve states;
 * a player cares about five questions — can I enter, is it on, am I waiting, is it decided, is it off.
 */

import type { DailyChallengeStatus } from "@prisma/client";
import type { StatusTone } from "@/components/StatusPill";
import { challengePool } from "@/lib/dailyChallenges";

type Clock = {
  status: DailyChallengeStatus;
  pausedAt: Date | null;
  entryOpensAt: Date;
  entryClosesAt: Date;
  windowStartsAt: Date;
  windowEndsAt: Date;
  submissionsCloseAt: Date;
};

export type PlayerStage = { tone: StatusTone; label: string; pulse?: boolean };

export function playerStage(c: Clock, now: Date = new Date()): PlayerStage {
  if (c.pausedAt && c.status !== "CANCELLED") return { tone: "attention", label: "Paused" };
  switch (c.status) {
    case "DRAFT":
      return { tone: "neutral", label: "Draft" };
    case "SCHEDULED":
      return { tone: "open", label: "Opens soon" };
    case "OPEN":
      // The sweep may not have moved it yet; the clock is what a player experiences.
      if (now >= c.windowStartsAt) return { tone: "live", label: "Live", pulse: true };
      if (now >= c.entryClosesAt) return { tone: "neutral", label: "Entries closed" };
      return { tone: "live", label: "Open for entries", pulse: true };
    case "LIVE":
      return { tone: "live", label: "Live", pulse: true };
    case "SUBMISSIONS_CLOSED":
    case "UNDER_REVIEW":
      return { tone: "attention", label: "Being reviewed" };
    case "PROVISIONAL":
      return { tone: "attention", label: "Provisional results" };
    case "FINALIZED":
    case "SETTLING":
      return { tone: "complete", label: "Results final" };
    case "COMPLETED":
      return { tone: "complete", label: "Completed" };
    case "CANCELLED":
      return { tone: "cancelled", label: "Cancelled" };
  }
}

export type NextDeadline = { label: string; at: Date };

/** The one deadline worth counting down to right now, or null once nothing is ticking. */
export function nextDeadline(c: Clock, now: Date = new Date()): NextDeadline | null {
  if (c.pausedAt) return null;
  if (c.status === "SCHEDULED") return { label: "Entries open in", at: c.entryOpensAt };
  if (c.status === "OPEN" || c.status === "LIVE") {
    if (now < c.entryClosesAt && c.status === "OPEN") return { label: "Entries close in", at: c.entryClosesAt };
    if (now < c.windowStartsAt) return { label: "Match window opens in", at: c.windowStartsAt };
    if (now < c.windowEndsAt) return { label: "Match window closes in", at: c.windowEndsAt };
    if (now < c.submissionsCloseAt) return { label: "Submit your score within", at: c.submissionsCloseAt };
  }
  return null;
}

/** Whether a challenge belongs on the feed's "Open now" list: something a player can still do. */
export function isFeedActive(status: DailyChallengeStatus): boolean {
  return status === "SCHEDULED" || status === "OPEN" || status === "LIVE";
}

/** Kobo as naira with grouping — "₦1,000", "₦2,500.50". Whole naira drop the decimals. */
export function formatNaira(kobo: number): string {
  const naira = kobo / 100;
  return `₦${naira.toLocaleString("en-NG", { minimumFractionDigits: Number.isInteger(naira) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------------------------------------

const LAGOS_OFFSET_MS = 3_600_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const lagosDay = (at: Date) => Math.floor((at.getTime() + LAGOS_OFFSET_MS) / 86_400_000);

/** "Today 18:15", "Tomorrow 06:00", "Sun 18:15" — Lagos time, the way people say it, without the date unless it's far off. */
export function shortWhen(at: Date, now: Date = new Date()): string {
  const lagos = new Date(at.getTime() + LAGOS_OFFSET_MS);
  const hh = String(lagos.getUTCHours()).padStart(2, "0");
  const mm = String(lagos.getUTCMinutes()).padStart(2, "0");
  const dayDiff = lagosDay(at) - lagosDay(now);
  const day = dayDiff === 0 ? "Today" : dayDiff === 1 ? "Tomorrow" : dayDiff === -1 ? "Yesterday" : dayDiff > 1 && dayDiff < 7 ? WEEKDAYS[lagos.getUTCDay()] : `${lagos.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][lagos.getUTCMonth()]}`;
  return `${day} ${hh}:${mm}`;
}

/**
 * The one line of timing on a card: whichever deadline matters now, said plainly. Nothing for a challenge that is over
 * and settled.
 */
export function cardTimeLine(c: Clock, now: Date = new Date()): string {
  if (c.pausedAt) return "Paused";
  switch (c.status) {
    case "SCHEDULED":
      return `Opens ${shortWhen(c.entryOpensAt, now)}`;
    case "OPEN":
    case "LIVE":
      if (c.status === "OPEN" && now < c.entryClosesAt) return `Entries close ${shortWhen(c.entryClosesAt, now)}`;
      if (now < c.windowStartsAt) return `Match window opens ${shortWhen(c.windowStartsAt, now)}`;
      if (now < c.windowEndsAt) return `Match window closes ${shortWhen(c.windowEndsAt, now)}`;
      if (now < c.submissionsCloseAt) return `Submit by ${shortWhen(c.submissionsCloseAt, now)}`;
      return "Waiting for review";
    case "SUBMISSIONS_CLOSED":
    case "UNDER_REVIEW":
      return "Staff are checking scores";
    case "PROVISIONAL":
      return "Provisional results — open to disputes";
    case "FINALIZED":
    case "SETTLING":
      return "Results final — paying out";
    case "COMPLETED":
      return "Settled";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "";
  }
}

/** The prize on a card: a short label and the amount in kobo (null = nothing cash to win). */
export function prizeSummary(c: {
  categoryPrizeTotal: number | null;
  entryFee: number;
  platformFeeBps: number;
  maxEntrants: number;
  entered: number;
  sponsorKobo: number;
}): { label: string; kobo: number | null } {
  if (c.categoryPrizeTotal !== null) return c.categoryPrizeTotal > 0 ? { label: "Prizes", kobo: c.categoryPrizeTotal } : { label: "Prize", kobo: null };
  const full = challengePool({ entryFee: c.entryFee, platformFeeBps: c.platformFeeBps, entryCount: c.maxEntrants, sponsorKobo: c.sponsorKobo }).prizePool;
  if (full <= 0) return { label: "Prize", kobo: null };
  if (c.entered === 0) return { label: "Prize pool up to", kobo: full };
  return { label: "Prize pool", kobo: challengePool({ entryFee: c.entryFee, platformFeeBps: c.platformFeeBps, entryCount: c.entered, sponsorKobo: c.sponsorKobo }).prizePool };
}
