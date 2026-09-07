/**
 * Circuit — staff abuse-report queue (Build Plan P6-3/P6-4, maps: TRU-3, TRU-4).
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import ReportActions from "./ReportActions";

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
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Open reports</h1>
        <Link href="/staff/disputes" className="text-sm font-medium text-brand underline">
          Escalated disputes →
        </Link>
      </div>

      {reports.length === 0 ? (
        <p className="card text-center text-muted">No open reports right now.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((report) => (
            <div key={report.id} className="card-row flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <Link href={`/players/${report.reportedUser.handle}`} className="font-medium hover:underline">
                  {report.reportedUser.displayName} (@{report.reportedUser.handle})
                </Link>
                {report.reportedUser.isSuspended && (
                  <span className="rounded-full bg-status-cancelled/15 px-2.5 py-1 text-xs font-medium text-status-cancelled">
                    Suspended
                  </span>
                )}
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
                  className="w-fit text-sm font-medium text-brand underline"
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
