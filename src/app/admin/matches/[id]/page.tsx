/**
 * Circuit — admin match/dispute review, native to the admin shell.
 * Replaces the "View match ↗"/"Rule now ↗" links out to the player-facing
 * `/matches/[id]` — same real data (players, submitted results, proof,
 * dispute status, activity timeline) and the exact same `RulingForm` that
 * page renders, just hosted here with an admin-appropriate back link and
 * player links pointing at the admin user page instead of the public
 * profile.
 *
 * A staff account viewing this is always eligible for the *staff* ruling
 * path only (never the organizer path — that stays on the player-facing
 * page, since it's the organizer's own call, not staff's). Staff can only
 * actually rule once a dispute is ESCALATED, same restriction the ruling
 * API itself enforces (`ruleDispute`'s `NOT_ESCALATED` check) — an
 * OPEN/ORGANIZER_REVIEW dispute shows its real status here, not a form
 * staff can't submit.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { StatusPill, matchStatusInfo } from "@/components/StatusPill";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { buildMatchTimeline } from "@/lib/matchTimeline";
import RulingForm from "@/app/matches/[id]/RulingForm";

function playerLabel(user: { displayName: string; handle: string }): string {
  return `${user.displayName} (@${user.handle})`;
}

export default async function AdminMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      playerA: true,
      playerB: true,
      winner: true,
      tournament: { select: { id: true, name: true } },
      battle: { select: { id: true, game: true } },
      dispute: true,
    },
  });
  if (!match) notFound();

  const canRuleAsStaff = match.dispute?.status === "ESCALATED";
  const voidUnsupportedReason = match.tournamentId
    ? "Voiding a tournament bracket match isn't supported yet."
    : undefined;
  const status = matchStatusInfo(match.status);

  const backHref = match.tournamentId ? `/admin/competitions/${match.tournamentId}` : `/admin/challenges/${match.battleId}`;
  const backLabel = match.tournamentId ? "Back to Competition" : "Back to Challenge";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Link href={backHref} className="w-fit text-sm font-medium text-muted transition hover:text-foreground">
        ← {backLabel}
      </Link>

      <div className="flex flex-col gap-2">
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {match.tournament ? `${match.tournament.name} · Round ${match.round}` : `Challenge · ${match.battle?.game}`}
        </h1>
        <p className="text-sm text-muted">
          Match code · <span className="font-mono">{match.matchCode}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[match.playerA, match.playerB].map((p, i) => {
          const isWinner = match.winnerId === p.id;
          return (
            <div key={i} className={`card flex flex-col gap-1 ${isWinner ? "border-success/40" : ""}`}>
              <div className="text-eyebrow">Player {i === 0 ? "A" : "B"}</div>
              <Link href={`/admin/users/${p.id}`} className="flex items-center gap-1.5 font-medium hover:underline">
                {isWinner && (
                  <>
                    <Trophy size={14} className="shrink-0 text-gold" aria-hidden="true" />
                    <span className="sr-only">Winner: </span>
                  </>
                )}
                {playerLabel(p)}
              </Link>
            </div>
          );
        })}
      </div>

      {(match.proofARef || match.proofBRef) && (
        <div className="flex flex-wrap gap-4">
          {match.proofARef && (
            <a href={`/api/matches/${match.id}/proof/a`} target="_blank" rel="noreferrer" className="text-sm font-medium text-accent-blue hover:underline">
              View Player A&apos;s proof
            </a>
          )}
          {match.proofBRef && (
            <a href={`/api/matches/${match.id}/proof/b`} target="_blank" rel="noreferrer" className="text-sm font-medium text-accent-blue hover:underline">
              View Player B&apos;s proof
            </a>
          )}
        </div>
      )}

      {match.status === "DISPUTED" && match.dispute && (
        <div className="flex flex-col gap-4">
          {canRuleAsStaff ? (
            <>
              <p className="alert alert-warning">This dispute is escalated to staff — your ruling is final.</p>
              <RulingForm
                disputeId={match.dispute.id}
                endpoint={`/api/staff/disputes/${match.dispute.id}/rule`}
                playerA={match.playerA}
                playerB={match.playerB}
                voidUnsupportedReason={voidUnsupportedReason}
              />
            </>
          ) : (
            <p className="alert alert-info">
              {match.dispute.status === "ORGANIZER_REVIEW"
                ? "Awaiting the tournament organizer's ruling — it escalates to staff automatically if they miss the ruling window."
                : "This dispute isn't in the staff queue."}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-section-heading">Activity</h2>
        <ActivityTimeline events={buildMatchTimeline(match)} />
      </div>
    </div>
  );
}
