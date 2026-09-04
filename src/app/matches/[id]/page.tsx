/**
 * Circuit — match detail page (Build Plan P3-4/P3-8/P6-2, maps: BRK-2).
 * No login required to view (guest visibility, per BRK-2) — submitting a
 * result or ruling is what's gated, inside the forms/routes themselves.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          {match.status.replace("_", " ")}
        </span>
        <h1 className="text-2xl font-semibold">
          {match.tournament ? `${match.tournament.name} — Round ${match.round}` : "Battle match"}
        </h1>
        <p className="text-sm text-zinc-500">Match code: {match.matchCode}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded border border-black/10 p-4 dark:border-white/15">
        <div>
          <div className="text-xs text-zinc-500">Player A</div>
          <div className="font-medium">{playerLabel(match.playerA)}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Player B</div>
          <div className="font-medium">{playerLabel(match.playerB)}</div>
        </div>
      </div>

      {match.status === "COMPLETE" && match.winner && (
        <p className="text-sm text-zinc-500">
          Winner: <span className="font-medium text-zinc-900 dark:text-zinc-100">{playerLabel(match.winner)}</span>
        </p>
      )}

      {(match.proofARef || match.proofBRef) && (
        <div className="flex gap-4 text-sm">
          {match.proofARef && (
            <a href={`/api/matches/${match.id}/proof/a`} className="underline" target="_blank" rel="noreferrer">
              View Player A&apos;s proof
            </a>
          )}
          {match.proofBRef && (
            <a href={`/api/matches/${match.id}/proof/b`} className="underline" target="_blank" rel="noreferrer">
              View Player B&apos;s proof
            </a>
          )}
        </div>
      )}

      {isParticipant && !hasSubmitted && (match.status === "UPCOMING" || match.status === "NEEDS_RESULT") && (
        <ResultForm matchId={match.id} playerA={match.playerA} playerB={match.playerB} />
      )}
      {isParticipant && hasSubmitted && match.status === "NEEDS_RESULT" && (
        <p className="text-sm text-zinc-500">
          You&apos;ve submitted your result. Waiting on the other player.
        </p>
      )}

      {match.status === "DISPUTED" && match.dispute && (
        <div className="flex flex-col gap-2 rounded border border-amber-300 p-4 text-sm dark:border-amber-800">
          <p className="font-medium">This match is under dispute review.</p>
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
