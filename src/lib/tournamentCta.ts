/**
 * Circuit — what a tournament card or hero says about itself, decided in
 * one place so Home, Compete and the hero never disagree: the status pill
 * (including "Full", which the database doesn't have — it's registration
 * open with no slots left) and the action label for that state.
 */

import { tournamentStatusInfo } from "@/components/StatusPill";

type Counts = { status: string; participantCap: number; registered: number };

export function spotsLeft({ participantCap, registered }: Pick<Counts, "participantCap" | "registered">): number {
  return Math.max(0, participantCap - registered);
}

/** "Announced" for a not-yet-open draft; "Full" for an open tournament with no slots. */
export function tournamentDisplayStatus(c: Counts) {
  if (c.status === "DRAFT") return { tone: "neutral" as const, label: "Announced", pulse: false };
  if (c.status === "OPEN" && c.participantCap > 0 && spotsLeft(c) === 0) return { tone: "attention" as const, label: "Full", pulse: false };
  const s = tournamentStatusInfo(c.status);
  return { tone: s.tone, label: s.label, pulse: !!s.pulse };
}

/** The action a card or hero button offers for this state. */
export function tournamentCtaLabel(c: Counts): string {
  switch (c.status) {
    case "OPEN":
      return c.participantCap > 0 && spotsLeft(c) === 0 ? "View tournament" : "Register now";
    case "LIVE":
      return "Follow live";
    case "COMPLETE":
      return "View results";
    default:
      return "View details";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when the start is in the future and within a day, so a ticking countdown reads naturally. */
export function startsWithinADay(startAt: Date, now: Date = new Date()): boolean {
  const remaining = startAt.getTime() - now.getTime();
  return remaining > 0 && remaining <= DAY_MS;
}
