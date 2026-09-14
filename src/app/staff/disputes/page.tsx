/**
 * Circuit — staff dispute queue (Build Plan P6-1, maps: TRU-1).
 *
 * Every escalated dispute, from both bracket matches and Battles, sorted
 * by wait time — oldest first, so "nothing sits unassigned indefinitely"
 * (TRU-1's acceptance criteria) is at least visible even without a formal
 * assignment/SLA system yet. Ruling happens on the match's own page
 * (src/app/matches/[id]/page.tsx already renders a staff RulingForm for
 * any ESCALATED dispute) rather than a separate ruling UI here.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { StatusPill, disputeStatusInfo } from "@/components/StatusPill";

function timeSince(date: Date): string {
  const ms = Date.now() - date.getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return "under an hour";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export default async function StaffDisputeQueuePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/staff/disputes");
  }
  if (!user.isStaff) {
    redirect("/");
  }

  const disputes = await prisma.dispute.findMany({
    where: { status: "ESCALATED" },
    orderBy: { createdAt: "asc" },
    include: {
      match: {
        include: {
          playerA: { select: { displayName: true, handle: true } },
          playerB: { select: { displayName: true, handle: true } },
          tournament: { select: { name: true } },
          battle: { select: { game: true } },
        },
      },
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Escalated disputes</h1>
        <Link href="/staff/reports" className="text-sm font-medium text-accent-blue hover:underline">
          Abuse reports →
        </Link>
      </div>

      {disputes.length === 0 ? (
        <p className="card text-center text-muted">No escalated disputes right now.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {disputes.map((dispute) => {
            const status = disputeStatusInfo(dispute.status);
            return (
              <Link
                key={dispute.id}
                href={`/matches/${dispute.matchId}`}
                className="card-row flex items-center justify-between gap-3 p-4"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-xs text-muted">
                    {dispute.match.tournament?.name ?? `Battle (${dispute.match.battle?.game})`}
                  </span>
                  <span className="truncate font-medium">
                    {dispute.match.playerA.displayName} vs {dispute.match.playerB.displayName}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusPill tone={status.tone}>{status.label}</StatusPill>
                  <span className="text-metadata">Waiting {timeSince(dispute.createdAt)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
