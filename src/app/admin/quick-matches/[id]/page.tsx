/**
 * Circuit — admin Quick Match detail. Clone of /admin/challenges/[id]'s
 * own shape: status, host, entry, created, plus every recipient and
 * their status (the trace a payout/eligibility dispute would need), the
 * accepted player + resulting Battle link, and cancellation info.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { StatusPill, quickMatchStatusInfo } from "@/components/StatusPill";
import { CancelQuickMatchButton } from "@/components/admin/CancelQuickMatchButton";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatDate(date: Date): string {
  return date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function formatBattleFormat(format: string): string {
  return format === "BEST_OF_3" ? "Best of 3" : "Single match";
}

const RECIPIENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

export default async function AdminQuickMatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const challenge = await prisma.quickMatchChallenge.findUnique({
    where: { id },
    include: {
      host: { select: { id: true, displayName: true, handle: true } },
      acceptedBy: { select: { id: true, displayName: true, handle: true } },
      recipients: {
        include: { recipient: { select: { id: true, displayName: true, handle: true } } },
        orderBy: { sentAt: "asc" },
      },
    },
  });
  if (!challenge) notFound();

  const status = quickMatchStatusInfo(challenge.status);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Link href="/admin/quick-matches" className="w-fit text-sm font-medium text-muted transition hover:text-foreground">
        ← All Quick Matches
      </Link>

      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <StatusPill tone={status.tone} pulse={status.pulse}>
            {status.label}
          </StatusPill>
          <h1 className="font-display text-2xl font-bold tracking-tight">{challenge.game}</h1>
          <span className="text-sm text-muted">{formatBattleFormat(challenge.format)}</span>
        </div>
        {challenge.status === "PENDING" && <CancelQuickMatchButton challengeId={challenge.id} />}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Host</span>
          <Link href={`/admin/users/${challenge.host.id}`} className="text-sm font-semibold hover:text-accent-volt">
            {challenge.host.displayName}
          </Link>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Entry</span>
          <span className="text-stat text-lg">{challenge.stakeAmount === 0 ? "Free" : formatNaira(challenge.stakeAmount)}</span>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Created</span>
          <span className="text-stat text-lg">{formatDate(challenge.createdAt)}</span>
        </div>
      </div>

      {challenge.battleId && (
        <div className="card flex items-center justify-between gap-3">
          <span className="text-sm text-muted">
            Accepted by{" "}
            <Link href={`/admin/users/${challenge.acceptedBy?.id}`} className="font-semibold text-foreground hover:text-accent-volt">
              {challenge.acceptedBy?.displayName}
            </Link>
          </span>
          <Link href={`/admin/challenges/${challenge.battleId}`} className="text-sm font-medium text-accent-blue hover:underline">
            View battle →
          </Link>
        </div>
      )}

      <div className="card flex flex-col gap-3">
        <h2 className="text-card-title">Recipients ({challenge.recipients.length})</h2>
        <div className="flex flex-col gap-1">
          {challenge.recipients.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-b-0">
              <Link href={`/admin/users/${r.recipient.id}`} className="font-medium hover:text-accent-volt">
                {r.recipient.displayName}
              </Link>
              <span className="text-muted">{RECIPIENT_STATUS_LABEL[r.status] ?? r.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
