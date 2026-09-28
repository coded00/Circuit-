/**
 * Circuit — Admin Reports: the moderation queues — player reports (Report),
 * community content reports escalated past community moderators, and
 * appeals against suspensions. The actions are the same components the
 * old /staff/reports page used (ReportActions, ReportQueue, AppealQueue).
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { communityHref, communityTitle } from "@/lib/community";
import { listEscalatedReports } from "@/lib/communityReports";
import { listOpenAppeals } from "@/lib/appeals";
import { ReportQueue } from "@/components/community/CommunitySettingsPanels";
import { AppealQueue } from "@/components/community/AppealQueue";
import ReportActions from "@/components/admin/ReportActions";
import { EmptyState, PageHeader, Panel, StatusBadge, SubNav } from "@/components/admin/ui";

const TABS = ["players", "communities", "appeals"] as const;

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((t) => t === tabParam) ?? "players";

  const [reports, communityReports, appeals] = await Promise.all([
    prisma.report.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "asc" },
      include: {
        reportedUser: { select: { id: true, displayName: true, handle: true, isSuspended: true } },
        reportedBy: { select: { displayName: true, handle: true } },
      },
    }),
    listEscalatedReports(),
    listOpenAppeals(),
  ]);

  return (
    <>
      <PageHeader title="Reports" description="Player reports, community content escalated past its moderators, and appeals against suspensions. Oldest first." />
      <SubNav
        active={tab}
        items={[
          { key: "players", label: "Player reports", href: "/admin/reports", count: reports.length },
          { key: "communities", label: "Community reports", href: "/admin/reports?tab=communities", count: communityReports.length },
          { key: "appeals", label: "Appeals", href: "/admin/reports?tab=appeals", count: appeals.length },
        ]}
      />

      {tab === "players" &&
        (reports.length === 0 ? (
          <EmptyState title="No open player reports" />
        ) : (
          <div className="flex flex-col gap-3">
            {reports.map((report) => (
              <Panel key={report.id}>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <Link href={`/admin/users/${report.reportedUser.id}`} className="text-[14px] font-semibold text-foreground hover:underline">
                          {report.reportedUser.displayName}
                        </Link>
                        <span className="text-[12px] text-muted">@{report.reportedUser.handle}</span>
                        {report.reportedUser.isSuspended && <StatusBadge tone="danger">Suspended</StatusBadge>}
                      </span>
                      <span className="text-[12px] text-muted">
                        Reported by {report.reportedBy.displayName} · {report.createdAt.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                    {report.evidenceRef && (
                      <a href={`/api/reports/${report.id}/evidence`} target="_blank" rel="noreferrer" className="btn-secondary !min-h-8 !px-2.5 !text-[12px]">
                        View evidence
                      </a>
                    )}
                  </div>
                  <p className="border-l-2 border-border-strong pl-3 text-[13px] text-foreground">{report.reason}</p>
                  <ReportActions reportId={report.id} reportedUserId={report.reportedUser.id} alreadySuspended={report.reportedUser.isSuspended} />
                </div>
              </Panel>
            ))}
          </div>
        ))}

      {tab === "communities" && (
        <ReportQueue
          staff
          communityLinks
          reports={communityReports.map((r) => ({
            id: r.id,
            status: "ESCALATED" as const,
            targetType: r.targetType,
            reason: r.reason,
            details: r.details,
            messageContent: r.messageContent,
            messageRemoved: !r.message || !!r.message.deletedAt,
            channelName: r.message?.channel.name ?? null,
            createdAt: r.createdAt.toISOString(),
            reporter: r.reporter,
            targetUser: r.targetUser,
            community: { name: communityTitle(r.community), href: communityHref(r.community) },
          }))}
        />
      )}

      {tab === "appeals" && (
        <AppealQueue
          appeals={appeals.map((a) => ({
            id: a.id,
            kind: a.kind,
            message: a.message,
            createdAt: a.createdAt.toISOString(),
            user: a.user,
            community: a.community ? { name: communityTitle(a.community), href: communityHref(a.community), suspensionReason: a.community.suspensionReason } : null,
          }))}
        />
      )}
    </>
  );
}
