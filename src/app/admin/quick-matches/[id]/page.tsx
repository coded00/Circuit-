/**
 * Circuit — admin Quick Match detail. Clone of /admin/challenges/[id]'s
 * own shape: status, host, entry, created, plus every recipient and
 * their status (the trace a payout/eligibility dispute would need), the
 * accepted player + resulting Battle link, and cancellation info.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { quickMatchStatusInfo } from "@/components/StatusPill";
import { EmptyState, KeyValue, naira, PageHeader, Panel, Section, StatusBadge, toneFor } from "@/components/admin/ui";
import { RowLink } from "@/components/admin/ui-client";
import { CancelQuickMatchButton } from "@/components/admin/CancelQuickMatchButton";

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
    <>
      <PageHeader
        back={{ href: "/admin/quick-matches", label: "Quick Matches" }}
        title={`${challenge.game} Quick Match`}
        meta={
          <>
            <StatusBadge tone={toneFor(status.tone)} dot={status.pulse}>
              {status.label}
            </StatusBadge>
            <span>{formatBattleFormat(challenge.format)}</span>
          </>
        }
        actions={challenge.status === "PENDING" && <CancelQuickMatchButton challengeId={challenge.id} />}
      />

      <Panel>
        <KeyValue
          items={[
            {
              label: "Host",
              value: (
                <Link href={`/admin/users/${challenge.host.id}`} className="hover:underline">
                  {challenge.host.displayName}
                </Link>
              ),
            },
            { label: "Stake", value: challenge.stakeAmount === 0 ? "Free" : naira(challenge.stakeAmount) },
            { label: "Created", value: formatDate(challenge.createdAt) },
            {
              label: "Accepted by",
              value: challenge.acceptedBy ? (
                <Link href={`/admin/users/${challenge.acceptedBy.id}`} className="hover:underline">
                  {challenge.acceptedBy.displayName}
                </Link>
              ) : (
                "—"
              ),
            },
            ...(challenge.battleId
              ? [
                  {
                    label: "Resulting challenge",
                    value: (
                      <Link href={`/admin/challenges/${challenge.battleId}`} className="hover:underline">
                        Open challenge →
                      </Link>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Panel>

      <Section title={`Sent to · ${challenge.recipients.length}`}>
        {challenge.recipients.length === 0 ? (
          <EmptyState title="No recipients" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Response</th>
                </tr>
              </thead>
              <tbody>
                {challenge.recipients.map((r) => (
                  <RowLink key={r.id} href={`/admin/users/${r.recipient.id}`}>
                    <td>
                      <Link href={`/admin/users/${r.recipient.id}`} className="font-medium text-foreground">
                        {r.recipient.displayName}
                      </Link>
                    </td>
                    <td className="text-muted">{RECIPIENT_STATUS_LABEL[r.status] ?? r.status}</td>
                  </RowLink>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
