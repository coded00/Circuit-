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
      <h1 className="text-2xl font-semibold">Escalated disputes</h1>

      {disputes.length === 0 ? (
        <p className="text-zinc-500">No escalated disputes right now.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {disputes.map((dispute) => (
            <Link
              key={dispute.id}
              href={`/matches/${dispute.matchId}`}
              className="flex flex-col gap-1 rounded border border-black/10 p-4 hover:bg-black/[.02] dark:border-white/15 dark:hover:bg-white/[.04]"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {dispute.match.tournament?.name ?? `Battle (${dispute.match.battle?.game})`}
                </span>
                <span className="text-xs text-zinc-500">Waiting {timeSince(dispute.createdAt)}</span>
              </div>
              <span className="text-sm text-zinc-500">
                {dispute.match.playerA.displayName} vs {dispute.match.playerB.displayName}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
