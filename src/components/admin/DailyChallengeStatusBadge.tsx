import { StatusBadge, type BadgeTone } from "@/components/admin/ui";

const STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  DRAFT: { tone: "neutral", label: "Draft" },
  SCHEDULED: { tone: "info", label: "Scheduled" },
  OPEN: { tone: "live", label: "Open for entries" },
  LIVE: { tone: "live", label: "Live" },
  SUBMISSIONS_CLOSED: { tone: "attention", label: "Submissions closed" },
  UNDER_REVIEW: { tone: "attention", label: "Under review" },
  PROVISIONAL: { tone: "attention", label: "Provisional results" },
  FINALIZED: { tone: "success", label: "Finalized" },
  SETTLING: { tone: "attention", label: "Settling" },
  COMPLETED: { tone: "success", label: "Completed" },
  CANCELLED: { tone: "danger", label: "Cancelled" },
};

export function DailyChallengeStatusBadge({ status, paused = false }: { status: string; paused?: boolean }) {
  const s = STATUS[status] ?? { tone: "neutral" as const, label: status };
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusBadge tone={s.tone} dot={status === "OPEN" || status === "LIVE"}>
        {s.label}
      </StatusBadge>
      {paused && <StatusBadge tone="danger">Paused</StatusBadge>}
    </span>
  );
}
