/**
 * Circuit — shared match activity timeline, built entirely from data
 * already on Match/Dispute (no schema change). Used by the player-facing
 * match page and the admin-native match/dispute review page so the two
 * surfaces never drift on what actually happened to a match.
 *
 * "Match completed" has no dedicated timestamp column, so it's inferred
 * as the later of the two submissions (auto-complete runs synchronously
 * right after the second one lands) or the dispute's own ruledAt when
 * there was one.
 */

import type { TimelineEvent } from "@/components/ActivityTimeline";

type ResultPayload = { winnerId: string; score: string; submittedAt: string };

export function buildMatchTimeline(match: {
  createdAt: Date;
  status: string;
  resultA: unknown;
  resultB: unknown;
  playerA: { displayName: string };
  playerB: { displayName: string };
  winner: { displayName: string } | null;
  dispute: {
    createdAt: Date;
    status: string;
    ruling: string | null;
    ruledAt: Date | null;
    ruledById: string | null;
  } | null;
}): TimelineEvent[] {
  const events: TimelineEvent[] = [{ at: match.createdAt, label: "Match created" }];
  const resultA = match.resultA as ResultPayload | null;
  const resultB = match.resultB as ResultPayload | null;

  if (resultA) {
    events.push({
      at: new Date(resultA.submittedAt),
      label: `${match.playerA.displayName} submitted a result: ${resultA.score}`,
    });
  }
  if (resultB) {
    events.push({
      at: new Date(resultB.submittedAt),
      label: `${match.playerB.displayName} submitted a result: ${resultB.score}`,
    });
  }

  if (match.dispute) {
    events.push({ at: match.dispute.createdAt, label: "Dispute opened: reports conflicted" });
    if (match.dispute.ruledAt) {
      events.push({
        at: match.dispute.ruledAt,
        label:
          match.dispute.status === "VOID"
            ? `Ruling: match voided${match.dispute.ruling ? ` (${match.dispute.ruling})` : ""}`
            : `Ruling: ${match.winner?.displayName ?? "winner"} confirmed${match.dispute.ruling ? ` (${match.dispute.ruling})` : ""}`,
      });
    }
  } else if (match.status === "COMPLETE" && resultA && resultB) {
    const completedAt = new Date(
      Math.max(new Date(resultA.submittedAt).getTime(), new Date(resultB.submittedAt).getTime())
    );
    events.push({ at: completedAt, label: `Match auto-completed: ${match.winner?.displayName ?? "winner"} advances` });
  } else if (match.status === "COMPLETE" && (resultA || resultB)) {
    // BRK-10: the silent side never reported, so the sweep auto-accepted
    // sometime after the window expired — reportWindowExpiresAt gets
    // cleared once complete, so there's no way to recover exactly when
    // that ran. Rather than fabricate a second timestamp, this appends to
    // the one submission event already added above instead of inventing one.
    const lastIndex = events.length - 1;
    events[lastIndex] = {
      ...events[lastIndex],
      label: `${events[lastIndex].label}. Later auto-accepted after the other side didn't respond.`,
    };
  }

  return events;
}
