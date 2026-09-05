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
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Escalated disputes</h1>
        <Link href="/staff/reports" className="text-sm font-medium text-brand underline">
          Abuse reports →
        </Link>
      </div>

      {disputes.length === 0 ? (
        <p className="card text-center text-muted">No escalated disputes right now.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {disputes.map((dispute) => (
            <Link
              key={dispute.id}
              href={`/matches/${dispute.matchId}`}
              className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 transition hover:border-border-strong hover:bg-surface-hover"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {dispute.match.tournament?.name ?? `Battle (${dispute.match.battle?.game})`}
                </span>
                <span className="rounded-full bg-status-attention/15 px-2.5 py-1 text-xs font-medium text-status-attention">
                  Waiting {timeSince(dispute.createdAt)}
                </span>
              </div>
              <span className="text-sm text-muted">
                {dispute.match.playerA.displayName} vs {dispute.match.playerB.displayName}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
