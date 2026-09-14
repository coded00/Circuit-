/**
 * Circuit — admin challenge detail, native to the admin shell. Real
 * `Battle` data plus its linked `Match` (if accepted) — same real
 * relations `/admin/challenges`'s list page reads, just at the per-item
 * level. "View match" is native too, at `/admin/matches/[id]` — the same
 * `RulingForm` the player-facing match page uses, just hosted here.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { StatusPill, battleStatusInfo, matchStatusInfo, disputeStatusInfo } from "@/components/StatusPill";
import { CancelChallengeButton } from "@/components/admin/CancelChallengeButton";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatDate(date: Date): string {
  return date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function formatBattleFormat(format: string): string {
  return format === "BEST_OF_3" ? "Best of 3" : "Single match";
}

export default async function AdminChallengeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const battle = await prisma.battle.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, displayName: true, handle: true } },
      targetUser: { select: { id: true, displayName: true, handle: true } },
      matches: {
        include: {
          playerA: { select: { id: true, displayName: true, handle: true } },
          playerB: { select: { id: true, displayName: true, handle: true } },
          winner: { select: { displayName: true } },
          dispute: true,
        },
      },
    },
  });
  if (!battle) notFound();

  const status = battleStatusInfo(battle.status);
  const match = battle.matches[0] ?? null;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Link href="/admin/challenges" className="w-fit text-sm font-medium text-muted transition hover:text-foreground">
        ← All challenges
      </Link>

      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <StatusPill tone={status.tone} pulse={status.pulse}>
            {status.label}
          </StatusPill>
          <h1 className="font-display text-2xl font-bold tracking-tight">{battle.game}</h1>
          <span className="text-sm text-muted">{formatBattleFormat(battle.format)}</span>
        </div>
        {battle.status === "OPEN" && <CancelChallengeButton battleId={battle.id} />}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Host</span>
          <Link href={`/admin/users/${battle.creator.id}`} className="text-sm font-semibold hover:text-accent-volt">
            {battle.creator.displayName}
          </Link>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Entry</span>
          <span className="text-stat text-lg">{battle.stakeAmount === 0 ? "Free" : formatNaira(battle.stakeAmount)}</span>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Created</span>
          <span className="text-stat text-lg">{formatDate(battle.createdAt)}</span>
        </div>
      </div>

      {battle.visibility === "TARGETED" && battle.targetUser && (
        <div className="card flex items-center justify-between gap-3">
          <span className="text-sm text-muted">Targeted at</span>
          <Link href={`/admin/users/${battle.targetUser.id}`} className="text-sm font-semibold hover:text-accent-volt">
            {battle.targetUser.displayName}
          </Link>
        </div>
      )}

      <div className="card flex flex-col gap-3">
        <h2 className="text-card-title">Match</h2>
        {!match ? (
          <p className="py-6 text-center text-sm text-muted">No one has accepted this challenge yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Link href={`/admin/users/${match.playerA.id}`} className="font-semibold hover:text-accent-volt">
                  {match.playerA.displayName}
                </Link>
                <span className="text-muted">vs</span>
                <Link href={`/admin/users/${match.playerB.id}`} className="font-semibold hover:text-accent-volt">
                  {match.playerB.displayName}
                </Link>
              </div>
              <StatusPill tone={matchStatusInfo(match.status).tone} pulse={matchStatusInfo(match.status).pulse}>
                {matchStatusInfo(match.status).label}
              </StatusPill>
            </div>
            <span className="font-mono text-xs text-muted-strong">Match code: {match.matchCode}</span>
            {match.winner && (
              <span className="text-sm text-muted">
                Winner: <span className="font-semibold text-foreground">{match.winner.displayName}</span>
              </span>
            )}
            {match.dispute && (
              <div className="flex items-center justify-between gap-3 rounded-[10px] border border-warning/30 bg-warning/10 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <StatusPill tone={disputeStatusInfo(match.dispute.status).tone}>
                    {disputeStatusInfo(match.dispute.status).label}
                  </StatusPill>
                  <span className="text-sm text-warning">Dispute raised</span>
                </div>
                <Link href={`/admin/matches/${match.id}`} className="text-sm font-medium text-accent-blue hover:underline">
                  View match →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
