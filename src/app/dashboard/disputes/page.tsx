/**
 * Circuit — Disputes view, across every one of the organizer's
 * tournaments at once (a real upgrade over having to open each
 * tournament separately to find out if it has a dispute).
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { StatusPill, disputeStatusInfo } from "@/components/StatusPill";

export default async function DashboardDisputesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const disputes = await prisma.dispute.findMany({
    where: {
      status: { in: ["OPEN", "ORGANIZER_REVIEW", "ESCALATED"] },
      match: { tournament: { organizerId: user.id } },
    },
    orderBy: { createdAt: "asc" },
    include: {
      match: {
        include: {
          playerA: { select: { displayName: true } },
          playerB: { select: { displayName: true } },
          tournament: { select: { id: true, name: true } },
        },
      },
    },
  });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Disputes</h1>

      {disputes.length === 0 ? (
        <p className="card text-center text-muted">Nothing needs a ruling right now.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {disputes.map((dispute) => {
            const status = disputeStatusInfo(dispute.status);
            return (
              <Link key={dispute.id} href={`/matches/${dispute.matchId}`} className="card-row flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-xs text-muted">{dispute.match.tournament?.name}</span>
                  <span className="truncate font-medium">
                    {dispute.match.playerA.displayName} vs {dispute.match.playerB.displayName}
                  </span>
                </div>
                <StatusPill tone={status.tone}>
                  {dispute.status === "ESCALATED" ? "Escalated to staff" : "Needs your ruling"}
                </StatusPill>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
