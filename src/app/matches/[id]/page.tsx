/**
 * Circuit — match detail page (Build Plan P3-4/P3-8/P6-2, maps: BRK-2).
 * No login required to view (guest visibility, per BRK-2) — submitting a
 * result or ruling is what's gated, inside the forms/routes themselves.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { StatusPill, matchStatusInfo } from "@/components/StatusPill";
import ResultForm from "./ResultForm";
import RulingForm from "./RulingForm";

function playerLabel(user: { displayName: string; handle: string }): string {
  return `${user.displayName} (@${user.handle})`;
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      playerA: true,
      playerB: true,
      winner: true,
      tournament: { select: { id: true, name: true, organizerId: true } },
      battle: { select: { id: true, game: true } },
      dispute: true,
    },
  });
  if (!match) notFound();

  const user = await getCurrentUser();
  const isParticipant = user !== null && (user.id === match.playerAId || user.id === match.playerBId);
  const isOrganizer = user !== null && match.tournament?.organizerId === user.id;
  const hasSubmitted =
    (user?.id === match.playerAId && match.resultA !== null) ||
    (user?.id === match.playerBId && match.resultB !== null);

  const canRuleAsOrganizer =
    isOrganizer && match.dispute?.status === "ORGANIZER_REVIEW" && !isParticipant;
  const canRuleAsStaff = user?.isStaff === true && match.dispute?.status === "ESCALATED";
  const status = matchStatusInfo(match.status);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
        <h1 className="text-2xl font-semibold">
          {match.tournament ? `${match.tournament.name} — Round ${match.round}` : "Battle match"}
        </h1>
        <p className="font-mono text-xs text-muted">Match code · {match.matchCode}</p>
      </div>

      <div className="card grid grid-cols-2 gap-4">
        {[match.playerA, match.playerB].map((p, i) => {
          const isWinner = match.winnerId === p.id;
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="text-xs text-muted">Player {i === 0 ? "A" : "B"}</div>
              <div className={isWinner ? "flex items-center gap-1.5 font-semibold text-brand" : "font-medium"}>
                {isWinner && <span>🏆</span>}
                {playerLabel(p)}
              </div>
            </div>
          );
        })}
      </div>

      {(match.proofARef || match.proofBRef) && (
        <div className="flex gap-4 text-sm">
          {match.proofARef && (
            <a
              href={`/api/matches/${match.id}/proof/a`}
              className="font-medium text-brand hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              View Player A&apos;s proof
            </a>
          )}
          {match.proofBRef && (
            <a
              href={`/api/matches/${match.id}/proof/b`}
              className="font-medium text-brand hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              View Player B&apos;s proof
            </a>
          )}
        </div>
      )}

      {isParticipant && !hasSubmitted && (match.status === "UPCOMING" || match.status === "NEEDS_RESULT") && (
        <ResultForm matchId={match.id} playerA={match.playerA} playerB={match.playerB} />
      )}
      {isParticipant && hasSubmitted && match.status === "NEEDS_RESULT" && (
        <p className="rounded-lg border border-status-attention/30 bg-status-attention/10 px-4 py-3 text-sm text-status-attention">
          You&apos;ve submitted your result. Waiting on the other player.
        </p>
      )}

      {match.status === "DISPUTED" && match.dispute && (
        <div className="flex flex-col gap-3 rounded-xl border border-status-cancelled/30 bg-status-cancelled/5 p-4 text-sm">
          <p className="font-medium text-status-cancelled">This match is under dispute review.</p>
          {canRuleAsOrganizer && match.dispute && (
            <RulingForm
              disputeId={match.dispute.id}
              endpoint={`/api/disputes/${match.dispute.id}/rule`}
              playerA={match.playerA}
              playerB={match.playerB}
              allowVoid={false}
            />
          )}
          {canRuleAsStaff && match.dispute && (
            <RulingForm
              disputeId={match.dispute.id}
              endpoint={`/api/staff/disputes/${match.dispute.id}/rule`}
              playerA={match.playerA}
              playerB={match.playerB}
              allowVoid={!match.tournamentId}
            />
          )}
        </div>
      )}
    </div>
  );
}
