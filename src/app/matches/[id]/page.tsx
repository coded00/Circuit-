/**
 * Circuit — match detail page (Build Plan P3-4/P3-8/P6-2, maps: BRK-2).
 * No login required to view (guest visibility, per BRK-2) — submitting a
 * result or ruling is what's gated, inside the forms/routes themselves.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { Trophy, Flag } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { StatusPill, matchStatusInfo } from "@/components/StatusPill";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { buildMatchTimeline } from "@/lib/matchTimeline";
import ResultForm from "./ResultForm";
import RulingForm from "./RulingForm";

function playerLabel(user: { displayName: string; handle: string }): string {
  return `${user.displayName} (@${user.handle})`;
}

/* Deterministic scatter (no Math.random — this renders server-side) for the
 * win banner's confetti burst. Purely decorative; carries no data. */
const CONFETTI_COLORS = ["var(--accent-volt)", "var(--accent-orange)", "var(--accent-blue)", "var(--gold)"];
const CONFETTI_PIECES = Array.from({ length: 10 }, (_, i) => ({
  left: (i * 37 + 5) % 96,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delayMs: (i % 5) * 80,
}));

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
  const wonThisMatch = isParticipant && match.winnerId === user?.id;
  const lostThisMatch = isParticipant && match.winnerId !== null && match.winnerId !== user?.id;
  // TRU-2/PRD §19: voiding is only unambiguous for a Battle (no stake,
  // nothing to return) — see MatchError "VOID_UNSUPPORTED" in
  // src/lib/matches.ts. Surfaced here (rather than just omitting the
  // option) so whoever's ruling sees why, not a silently missing choice.
  const voidUnsupportedReason = match.tournamentId
    ? "Voiding a tournament bracket match isn't supported yet."
    : undefined;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-2">
        <StatusPill tone={status.tone} pulse={status.pulse}>{status.label}</StatusPill>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {match.tournament ? `${match.tournament.name} · Round ${match.round}` : "Battle match"}
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
              <div className="flex items-center justify-between gap-2">
                <div className="text-eyebrow">Player {i === 0 ? "A" : "B"}</div>
                {user && user.id !== p.id && (
                  <Link
                    href={`/players/${p.handle}/report`}
                    className="flex items-center gap-1 text-xs text-muted hover:text-foreground"
                  >
                    <Flag size={12} />
                    Report
                  </Link>
                )}
              </div>
              <Link href={`/players/${p.handle}`} className="flex items-center gap-1.5 font-medium hover:underline">
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

      {wonThisMatch && (
        <div className="celebrate-fade relative overflow-hidden rounded-[14px] border border-gold/30 bg-gold/10 px-5 py-4">
          <div className="confetti-burst" aria-hidden>
            {CONFETTI_PIECES.map((p, i) => (
              <span
                key={i}
                className="confetti-piece"
                style={{ left: `${p.left}%`, backgroundColor: p.color, animationDelay: `${p.delayMs}ms` }}
              />
            ))}
          </div>
          <div className="relative z-10 flex items-center gap-3">
            <Trophy size={28} className="trophy-pop shrink-0 text-gold" aria-hidden="true" />
            <div className="flex flex-col">
              <span className="font-display text-lg font-bold tracking-tight">You won!</span>
              <span className="text-sm text-muted">Nice one. This counts toward your ladder rank.</span>
            </div>
          </div>
        </div>
      )}
      {lostThisMatch && (
        <div className="celebrate-fade card flex items-center gap-3">
          <span className="text-sm text-muted">GG, this one didn&apos;t go your way. Next one&apos;s yours.</span>
        </div>
      )}

      {(match.proofARef || match.proofBRef) && (
        <div className="flex flex-wrap gap-4">
          {match.proofARef && (
            <a
              href={`/api/matches/${match.id}/proof/a`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-accent-blue hover:underline"
            >
              View Player A&apos;s proof
            </a>
          )}
          {match.proofBRef && (
            <a
              href={`/api/matches/${match.id}/proof/b`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-accent-blue hover:underline"
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
        <p className="alert alert-info">
          You&apos;ve submitted your result. Waiting on the other player.
        </p>
      )}

      {match.status === "DISPUTED" && match.dispute && (
        <div className="flex flex-col gap-4">
          <p className="alert alert-warning">This match is under dispute review.</p>
          {canRuleAsOrganizer && match.dispute && (
            <RulingForm
              disputeId={match.dispute.id}
              endpoint={`/api/disputes/${match.dispute.id}/rule`}
              playerA={match.playerA}
              playerB={match.playerB}
              voidUnsupportedReason={voidUnsupportedReason}
            />
          )}
          {canRuleAsStaff && match.dispute && (
            <RulingForm
              disputeId={match.dispute.id}
              endpoint={`/api/staff/disputes/${match.dispute.id}/rule`}
              playerA={match.playerA}
              playerB={match.playerB}
              voidUnsupportedReason={voidUnsupportedReason}
            />
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
