/**
 * Circuit — match detail page (Build Plan P3-4/P3-8/P6-2, maps: BRK-2).
 * No login required to view (guest visibility, per BRK-2) — submitting a
 * result or ruling is what's gated, inside the forms/routes themselves.
 *
 * Queries and derives here; MatchView.tsx renders the head-to-head screen.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isWagerBattleWin } from "@/lib/awards";
import { gameStandings } from "@/lib/standings";
import { matchStatusInfo } from "@/components/StatusPill";
import { buildMatchTimeline } from "@/lib/matchTimeline";
import Poller from "@/app/Poller";
import { MatchView, type MatchPlayer, type MatchViewData } from "./MatchView";

type ResultPayload = { winnerId: string; score: string };

function formatBattleFormat(format: string): string {
  return format === "BEST_OF_3" ? "Best of 3" : "Single match";
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      playerA: true,
      playerB: true,
      winner: true,
      tournament: { select: { id: true, name: true, game: true, organizerId: true } },
      battle: { select: { id: true, game: true, format: true, stakeAmount: true } },
      dispute: true,
    },
  });
  if (!match) notFound();

  const user = await getCurrentUser();
  const side: "A" | "B" | null = user?.id === match.playerAId ? "A" : user?.id === match.playerBId ? "B" : null;
  const isOrganizer = user !== null && match.tournament?.organizerId === user.id;
  const hasReported = (side === "A" && match.resultA !== null) || (side === "B" && match.resultB !== null);

  // Rulings: the organizer during organizer review (never a participant),
  // or staff once escalated — same rules as before.
  const canRuleAsOrganizer = isOrganizer && match.dispute?.status === "ORGANIZER_REVIEW" && side === null;
  const canRuleAsStaff = user?.isStaff === true && match.dispute?.status === "ESCALATED";
  const ruling = canRuleAsOrganizer
    ? { endpoint: `/api/disputes/${match.dispute!.id}/rule` }
    : canRuleAsStaff
      ? { endpoint: `/api/staff/disputes/${match.dispute!.id}/rule` }
      : null;

  const game = match.battle?.game ?? match.tournament?.game ?? null;
  const standings = match.battle ? await gameStandings(match.battle.game) : [];
  const standingFor = (userId: string) => {
    const index = standings.findIndex((s) => s.userId === userId);
    return index === -1 ? null : { rank: index + 1, wins: standings[index].wins, losses: standings[index].losses };
  };

  const toPlayer = (p: typeof match.playerA, which: "A" | "B"): MatchPlayer => ({
    id: p.id,
    displayName: p.displayName,
    handle: p.handle,
    avatarUrl: p.avatarUrl,
    standing: standingFor(p.id),
    ready: (which === "A" ? match.playerAReadyAt : match.playerBReadyAt) !== null,
    reported: (which === "A" ? match.resultA : match.resultB) !== null,
    proofUrl: (which === "A" ? match.proofARef : match.proofBRef) ? `/api/matches/${match.id}/proof/${which.toLowerCase()}` : null,
  });

  // The accepted score: whichever report named the actual winner.
  const reports = [match.resultA, match.resultB].filter(Boolean) as ResultPayload[];
  const finalScore =
    match.status === "COMPLETE" && match.winnerId ? (reports.find((r) => r.winnerId === match.winnerId)?.score ?? null) : null;

  const bothReady = match.playerAReadyAt !== null && match.playerBReadyAt !== null;
  // Live-refresh while genuinely waiting on something to change.
  const showPoller = (match.battleId !== null && match.status === "UPCOMING" && !bothReady) || match.status === "NEEDS_RESULT";

  const data: MatchViewData = {
    id: match.id,
    code: match.matchCode,
    status: match.status,
    statusPill: matchStatusInfo(match.status),
    kind: match.battleId ? "battle" : "tournament",
    game,
    formatLabel: match.battle ? formatBattleFormat(match.battle.format) : `Round ${match.round}`,
    tournament: match.tournament ? { id: match.tournament.id, name: match.tournament.name } : null,
    battleId: match.battleId,
    stakeAmount: match.battle?.stakeAmount ?? 0,
    createdAt: match.createdAt,
    playerA: toPlayer(match.playerA, "A"),
    playerB: toPlayer(match.playerB, "B"),
    winnerId: match.winnerId,
    finalScore,
    viewer: {
      signedIn: user !== null,
      side,
      hasReported,
      canShareWin: side !== null && match.winnerId === user?.id && isWagerBattleWin(match),
    },
    reportWindowExpiresAt: match.reportWindowExpiresAt,
    dispute: match.dispute ? { id: match.dispute.id } : null,
    ruling,
    // TRU-2/PRD §19: voiding is only unambiguous for a Battle — see
    // MatchError "VOID_UNSUPPORTED" in src/lib/matches.ts.
    voidUnsupportedReason: match.tournamentId ? "Voiding a tournament bracket match isn't supported yet." : undefined,
    timeline: buildMatchTimeline(match),
  };

  return (
    <>
      {showPoller && <Poller />}
      <MatchView data={data} />
    </>
  );
}
