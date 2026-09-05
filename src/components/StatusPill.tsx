/**
 * Circuit — StatusPill (docs/circuit-ui-references.md: FACEIT + start.gg
 * independently converged on "colored pill on a card" for status — used
 * everywhere a Tournament/Registration/Battle/Match/Dispute status shows.
 */

export type StatusTone = "live" | "open" | "neutral" | "complete" | "cancelled" | "attention";

const TONE_CLASSES: Record<StatusTone, string> = {
  live: "bg-status-live/15 text-status-live",
  open: "bg-status-open/15 text-status-open",
  neutral: "bg-status-neutral/15 text-status-neutral",
  complete: "bg-status-complete/15 text-status-complete",
  cancelled: "bg-status-cancelled/15 text-status-cancelled",
  attention: "bg-status-attention/15 text-status-attention",
};

export function StatusPill({
  tone,
  children,
  pulse = false,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

type StatusInfo = { tone: StatusTone; label: string; pulse?: boolean };

export function tournamentStatusInfo(status: string): StatusInfo {
  switch (status) {
    case "DRAFT":
      return { tone: "neutral", label: "Draft" };
    case "OPEN":
      return { tone: "open", label: "Registration open" };
    case "CLOSED":
      return { tone: "neutral", label: "Registration closed" };
    case "LIVE":
      return { tone: "live", label: "Live", pulse: true };
    case "COMPLETE":
      return { tone: "complete", label: "Complete" };
    case "CANCELLED":
      return { tone: "cancelled", label: "Cancelled" };
    default:
      return { tone: "neutral", label: status };
  }
}

export function registrationStatusInfo(status: string): StatusInfo {
  switch (status) {
    case "PENDING_PAYMENT":
      return { tone: "attention", label: "Payment pending" };
    case "CONFIRMED":
      return { tone: "open", label: "Confirmed" };
    case "WITHDRAWN":
      return { tone: "neutral", label: "Withdrawn" };
    case "REFUNDED":
      return { tone: "neutral", label: "Refunded" };
    default:
      return { tone: "neutral", label: status };
  }
}

export function matchStatusInfo(status: string): StatusInfo {
  switch (status) {
    case "UPCOMING":
      return { tone: "neutral", label: "Upcoming" };
    case "NEEDS_RESULT":
      return { tone: "attention", label: "Needs result" };
    case "DISPUTED":
      return { tone: "cancelled", label: "Disputed" };
    case "COMPLETE":
      return { tone: "complete", label: "Complete" };
    default:
      return { tone: "neutral", label: status };
  }
}

export function battleStatusInfo(status: string): StatusInfo {
  switch (status) {
    case "OPEN":
      return { tone: "live", label: "Open", pulse: true };
    case "ACCEPTED":
      return { tone: "open", label: "In progress" };
    case "CANCELLED":
      return { tone: "cancelled", label: "Cancelled" };
    case "COMPLETE":
      return { tone: "complete", label: "Complete" };
    default:
      return { tone: "neutral", label: status };
  }
}

export function disputeStatusInfo(status: string): StatusInfo {
  switch (status) {
    case "OPEN":
      return { tone: "attention", label: "Open" };
    case "ORGANIZER_REVIEW":
      return { tone: "attention", label: "Awaiting organizer" };
    case "ESCALATED":
      return { tone: "cancelled", label: "Escalated to staff" };
    case "RESOLVED":
      return { tone: "complete", label: "Resolved" };
    case "VOID":
      return { tone: "neutral", label: "Void" };
    default:
      return { tone: "neutral", label: status };
  }
}
