/**
 * Circuit — staff abuse-report queue (Build Plan P6-3/P6-4, maps: TRU-3, TRU-4).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loginPath } from "@/lib/safeRedirect";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import ReportActions from "./ReportActions";
import { communityHref, communityTitle } from "@/lib/community";
import { listEscalatedReports } from "@/lib/communityReports";
import { listOpenAppeals } from "@/lib/appeals";
import { ReportQueue } from "@/components/community/CommunitySettingsPanels";
import { AppealQueue } from "@/components/community/AppealQueue";

const TABS = [
  { key: "players", label: "Player reports" },
  { key: "communities", label: "Community reports" },
  { key: "appeals", label: "Appeals" },
] as const;

// Staff-only queue — never real public content.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function StaffReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some((t) => t.key === tabParam) ? tabParam : "players";
  const user = await getCurrentUser();
  if (!user) {
    redirect(loginPath("/staff/reports"));
  }
  if (!user.isStaff) {
    redirect("/");
  }

  const [reports, communityReports, appeals] = await Promise.all([prisma.report.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    include: {
      reportedUser: { select: { id: true, displayName: true, handle: true, isSuspended: true } },
      reportedBy: { select: { displayName: true, handle: true } },
    },
  }), listEscalatedReports(), listOpenAppeals()]);
  const counts = { players: reports.length, communities: communityReports.length, appeals: appeals.length };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Reports &amp; appeals</h1>
        <Link href="/staff/disputes" className="text-sm font-medium text-accent-blue hover:underline">
          Escalated disputes →
        </Link>
      </div>

      <nav aria-label="Queues" className="scrollbar-hide -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/staff/reports?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
              tab === t.key ? "border-accent-volt text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
            {counts[t.key] > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-live px-1.5 font-mono text-[11px] text-white">{counts[t.key]}</span>}
          </Link>
        ))}
      </nav>

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

      {tab === "players" && (reports.length === 0 ? (
        <p className="card text-center text-muted">No open reports right now.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((report) => (
            <div key={report.id} className="card flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/players/${report.reportedUser.handle}`}
                  className="font-medium hover:text-accent-blue"
                >
                  {report.reportedUser.displayName} (@{report.reportedUser.handle})
                </Link>
                {report.reportedUser.isSuspended && <span className="badge badge-cancelled">Suspended</span>}
              </div>
              <p className="text-sm text-muted">
                Reported by {report.reportedBy.displayName} (@{report.reportedBy.handle})
              </p>
              <p className="text-sm">{report.reason}</p>
              {report.evidenceRef && (
                <a
                  href={`/api/reports/${report.id}/evidence`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-accent-blue hover:underline"
                >
                  View evidence
                </a>
              )}
              <ReportActions
                reportId={report.id}
                reportedUserId={report.reportedUser.id}
                alreadySuspended={report.reportedUser.isSuspended}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
