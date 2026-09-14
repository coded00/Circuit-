/**
 * Circuit — StatusPill. Used everywhere a Tournament/Registration/Battle/
 * Match/Dispute status shows. The tone→label mapping functions below are
 * real domain logic (not styling) and are unchanged.
 */

export type StatusTone = "live" | "open" | "neutral" | "complete" | "cancelled" | "attention";

const TONE_CLASS: Record<StatusTone, string> = {
  live: "badge-live",
  open: "badge-open",
  neutral: "badge-neutral",
  complete: "badge-complete",
  cancelled: "badge-cancelled",
  attention: "badge-attention",
};

export function StatusPill({
  tone,
  children,
  pulse = false,
  size = "sm",
}: {
  tone: StatusTone;
  children: React.ReactNode;
  pulse?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <span className={`badge ${TONE_CLASS[tone]} ${size === "md" ? "badge-md" : ""}`}>
      {pulse && (
        <span className="pulse-dot" aria-hidden />
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
