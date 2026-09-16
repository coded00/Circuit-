/**
 * Circuit — staff abuse-report queue (Build Plan P6-3/P6-4, maps: TRU-3, TRU-4).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import ReportActions from "./ReportActions";

// Staff-only queue — never real public content.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function StaffReportsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/staff/reports");
  }
  if (!user.isStaff) {
    redirect("/");
  }

  const reports = await prisma.report.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    include: {
      reportedUser: { select: { id: true, displayName: true, handle: true, isSuspended: true } },
      reportedBy: { select: { displayName: true, handle: true } },
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Open reports</h1>
        <Link href="/staff/disputes" className="text-sm font-medium text-accent-blue hover:underline">
          Escalated disputes →
        </Link>
      </div>

      {reports.length === 0 ? (
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
      )}
    </div>
  );
}
