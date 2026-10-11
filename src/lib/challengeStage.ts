/**
 * Circuit — where a Challenge stands, in the words players use. The
 * database has four states (open, accepted, complete, cancelled, plus
 * expired); the match underneath tells the rest: nobody ready yet, both in
 * and playing, a result waiting on the other side, or under review.
 */

import type { StatusTone } from "@/components/StatusPill";

type Stage = { tone: StatusTone; label: string; pulse?: boolean };

export function challengeStage(
  battle: { status: string; expiresAt: Date | null; createdAt: Date },
  match: { status: string; playerAReadyAt: Date | null; playerBReadyAt: Date | null } | null,
  expiresAt: Date,
  now: Date = new Date(),
): Stage {
  switch (battle.status) {
    case "OPEN":
      return expiresAt.getTime() <= now.getTime() ? { tone: "neutral", label: "Expired" } : { tone: "live", label: "Open", pulse: true };
    case "EXPIRED":
      return { tone: "neutral", label: "Expired" };
    case "CANCELLED":
      return { tone: "cancelled", label: "Cancelled" };
    case "COMPLETE":
      return { tone: "complete", label: "Completed" };
    case "ACCEPTED": {
      if (!match) return { tone: "open", label: "Accepted" };
      if (match.status === "DISPUTED") return { tone: "attention", label: "Disputed" };
      if (match.status === "NEEDS_RESULT") return { tone: "attention", label: "Result submitted" };
      if (match.status === "COMPLETE") return { tone: "complete", label: "Completed" };
      return match.playerAReadyAt && match.playerBReadyAt ? { tone: "live", label: "In progress", pulse: true } : { tone: "open", label: "Awaiting match" };
    }
    default:
      return { tone: "neutral", label: battle.status };
  }
}
