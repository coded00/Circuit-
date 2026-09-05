/**
 * Circuit — match detail page (Build Plan P3-4/P3-8/P6-2, maps: BRK-2).
 * No login required to view (guest visibility, per BRK-2) — submitting a
 * result or ruling is what's gated, inside the forms/routes themselves.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { StatusPill, matchStatusInfo } from "@/components/StatusPill";
import { ActivityTimeline, type TimelineEvent } from "@/components/ActivityTimeline";
import ResultForm from "./ResultForm";
import RulingForm from "./RulingForm";

function playerLabel(user: { displayName: string; handle: string }): string {
  return `${user.displayName} (@${user.handle})`;
}

type ResultPayload = { winnerId: string; score: string; submittedAt: string };

/**
 * Built entirely from data already on Match/Dispute — no schema change.
 * "Match completed" has no dedicated timestamp column, so it's inferred as
 * the later of the two submissions (auto-complete runs synchronously right
 * after the second one lands) or the dispute's own ruledAt when there was one.
 */
function buildMatchTimeline(match: {
  createdAt: Date;
  status: string;
  resultA: unknown;
  resultB: unknown;
  playerA: { displayName: string };
  playerB: { displayName: string };
  winner: { displayName: string } | null;
  dispute: {
    createdAt: Date;
    status: string;
    ruling: string | null;
    ruledAt: Date | null;
    ruledById: string | null;
  } | null;
}): TimelineEvent[] {
  const events: TimelineEvent[] = [{ at: match.createdAt, label: "Match created" }];
  const resultA = match.resultA as ResultPayload | null;
  const resultB = match.resultB as ResultPayload | null;

  if (resultA) {
    events.push({
      at: new Date(resultA.submittedAt),
      label: `${match.playerA.displayName} submitted a result: ${resultA.score}`,
    });
  }
  if (resultB) {
    events.push({
      at: new Date(resultB.submittedAt),
      label: `${match.playerB.displayName} submitted a result: ${resultB.score}`,
    });
  }

  if (match.dispute) {
    events.push({ at: match.dispute.createdAt, label: "Dispute opened — reports conflicted" });
    if (match.dispute.ruledAt) {
      events.push({
        at: match.dispute.ruledAt,
        label:
          match.dispute.status === "VOID"
            ? `Ruling: match voided${match.dispute.ruling ? ` — ${match.dispute.ruling}` : ""}`
            : `Ruling: ${match.winner?.displayName ?? "winner"} confirmed${match.dispute.ruling ? ` — ${match.dispute.ruling}` : ""}`,
      });
    }
  } else if (match.status === "COMPLETE" && resultA && resultB) {
    const completedAt = new Date(
      Math.max(new Date(resultA.submittedAt).getTime(), new Date(resultB.submittedAt).getTime())
    );
    events.push({ at: completedAt, label: `Match auto-completed — ${match.winner?.displayName ?? "winner"} advances` });
  } else if (match.status === "COMPLETE" && (resultA || resultB)) {
    // BRK-10: the silent side never reported, so the sweep auto-accepted
    // sometime after the window expired — reportWindowExpiresAt gets
    // cleared once complete, so there's no way to recover exactly when
    // that ran. Rather than fabricate a second timestamp, this appends to
    // the one submission event already added above instead of inventing one.
    const lastIndex = events.length - 1;
    events[lastIndex] = {
      ...events[lastIndex],
      label: `${events[lastIndex].label} — later auto-accepted after the other side didn't respond`,
    };
  }

  return events;
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

      <div className="flex flex-col gap-2 border-t border-border pt-6">
        <h2 className="text-lg font-semibold">Activity</h2>
        <ActivityTimeline events={buildMatchTimeline(match)} />
      </div>
    </div>
  );
}
