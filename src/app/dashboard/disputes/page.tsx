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
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Disputes</h1>

      {disputes.length === 0 ? (
        <p className="card text-center text-muted">Nothing needs a ruling right now.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {disputes.map((dispute) => {
            const status = disputeStatusInfo(dispute.status);
            return (
              <Link key={dispute.id} href={`/matches/${dispute.matchId}`} className="card-row flex items-center justify-between p-4">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{dispute.match.tournament?.name}</span>
                  <span className="text-muted">
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
