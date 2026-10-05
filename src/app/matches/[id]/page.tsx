/**
 * Circuit — match detail page (Build Plan P3-4/P3-8/P6-2, maps: BRK-2).
 * No login required to view (guest visibility, per BRK-2) — submitting a
 * result or ruling is what's gated, inside the forms/routes themselves.
 *
 * Queries and derives here; MatchView.tsx renders the head-to-head screen.
 */

import { DRAW_RESULT } from "@/lib/leagueTable";
import { isLeagueStructure } from "@/lib/leagueStandings";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isWagerBattleWin } from "@/lib/awards";
import { gameStandings } from "@/lib/standings";
import { matchStatusInfo } from "@/components/StatusPill";
import { buildMatchTimeline } from "@/lib/matchTimeline";
import Poller from "@/app/Poller";
import { teamEntryLabels } from "@/lib/teamEntries";
import { isRoundRobinStructure, isSwissStructure } from "@/lib/roundRobinStandings";
import { isDoubleElimStructure, nodeByMatch, nodeLabel } from "@/lib/doubleElim";
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
      tournament: { select: { id: true, name: true, game: true, organizerId: true, format: true, leagueDrawPoints: true } },
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

  // Round robin: the extra match after the last round is the tie-for-first decider;
  // double elimination: which bracket and round this is.
  let roundLabel = `Round ${match.round}`;
  let drawAllowed = false;
  /** League fixtures are due by their matchday's deadline. */
  let playBy: Date | null = null;
  if (["ROUND_ROBIN", "SWISS", "DOUBLE_ELIMINATION", "LEAGUE"].includes(match.tournament?.format ?? "") && match.tournamentId) {
    const bracket = await prisma.bracket.findUnique({ where: { tournamentId: match.tournamentId } });
    if (isLeagueStructure(bracket?.structure)) {
      const isDecider = (match.round ?? 0) > bracket.structure.totalRounds;
      roundLabel = isDecider ? "Decider" : `Matchday ${match.round}`;
      // Draws are worth points only if the organizer allowed them; a decider has to have a winner.
      drawAllowed = match.tournament?.leagueDrawPoints != null && !isDecider;
      const due = isDecider ? null : bracket.structure.deadlines[(match.round ?? 1) - 1];
      playBy = due && match.status !== "COMPLETE" ? new Date(due) : null;
    }
    if ((isRoundRobinStructure(bracket?.structure) || isSwissStructure(bracket?.structure)) && (match.round ?? 0) > bracket.structure.totalRounds) roundLabel = "Decider";
    if (isDoubleElimStructure(bracket?.structure)) {
      const n = nodeByMatch(bracket.structure, match.id);
      if (n) roundLabel = nodeLabel(bracket.structure, n);
    }
  }

  // Team tournaments: the captain holds the slot, the team's name is shown.
  const labels = match.tournamentId ? await teamEntryLabels(match.tournamentId) : new Map();
  // Players' own streams for this tournament, so a match can link to where it is being played live.
  const streams = match.tournamentId
    ? await prisma.registration.findMany({
        where: { tournamentId: match.tournamentId, userId: { in: [match.playerAId, match.playerBId] }, streamUrl: { not: null } },
        select: { userId: true, streamPlatform: true, streamPlatformName: true, streamUrl: true },
      })
    : [];
  const streamOf = (userId: string) => {
    const s = streams.find((x) => x.userId === userId);
    return s?.streamUrl ? { platform: s.streamPlatform, platformName: s.streamPlatformName, url: s.streamUrl } : null;
  };
  const toPlayer = (p: typeof match.playerA, which: "A" | "B"): MatchPlayer => ({
    id: p.id,
    displayName: labels.get(p.id)?.teamName ?? p.displayName,
    handle: p.handle,
    avatarUrl: p.avatarUrl,
    standing: standingFor(p.id),
    ready: (which === "A" ? match.playerAReadyAt : match.playerBReadyAt) !== null,
    reported: (which === "A" ? match.resultA : match.resultB) !== null,
    proofUrl: (which === "A" ? match.proofARef : match.proofBRef) ? `/api/matches/${match.id}/proof/${which.toLowerCase()}` : null,
    stream: streamOf(p.id),
  });

  // The accepted score: whichever report named the actual winner.
  const reports = [match.resultA, match.resultB].filter(Boolean) as ResultPayload[];
  const isDraw = match.status === "COMPLETE" && !match.winnerId && reports.some((r) => r.winnerId === DRAW_RESULT);
  const finalScore =
    match.status === "COMPLETE" && (match.winnerId || isDraw) ? (reports.find((r) => r.winnerId === (match.winnerId ?? DRAW_RESULT))?.score ?? null) : null;

  // Who each report says won, in words (names, not ids).
  const nameOf = (userId: string) => (userId === match.playerAId ? match.playerA.displayName : match.playerB.displayName);
  const claimText = (r: ResultPayload) => (r.winnerId === DRAW_RESULT ? "Draw" : `${nameOf(r.winnerId)} won`);
  const reportOf = (which: "A" | "B") => (which === "A" ? match.resultA : match.resultB) as (ResultPayload & { confirmed?: boolean }) | null;
  const opponentSide: "A" | "B" | null = side === "A" ? "B" : side === "B" ? "A" : null;
  const opponentRaw = opponentSide ? reportOf(opponentSide) : null;
  // The first player's claim, shown to the second so they can confirm or dispute it.
  const opponentReport =
    side !== null && opponentSide && opponentRaw && !hasReported && match.status === "NEEDS_RESULT"
      ? {
          claimText: opponentRaw.winnerId === user?.id ? "You won" : claimText(opponentRaw),
          score: opponentRaw.score,
          proofUrl: (opponentSide === "A" ? match.proofARef : match.proofBRef) ? `/api/matches/${match.id}/proof/${opponentSide.toLowerCase()}` : null,
        }
      : null;
  const reportRows = (["A", "B"] as const).flatMap((which) => {
    const r = reportOf(which);
    return r ? [{ name: which === "A" ? match.playerA.displayName : match.playerB.displayName, claimText: claimText(r), score: r.score, confirmed: !!r.confirmed }] : [];
  });

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
    formatLabel: match.battle ? formatBattleFormat(match.battle.format) : roundLabel,
    tournament: match.tournament ? { id: match.tournament.id, name: match.tournament.name } : null,
    battleId: match.battleId,
    stakeAmount: match.battle?.stakeAmount ?? 0,
    createdAt: match.createdAt,
    playerA: toPlayer(match.playerA, "A"),
    playerB: toPlayer(match.playerB, "B"),
    winnerId: match.winnerId,
    isDraw,
    drawAllowed,
    finalScore,
    viewer: {
      signedIn: user !== null,
      side,
      hasReported,
      canShareWin: side !== null && match.winnerId === user?.id && isWagerBattleWin(match),
    },
    reportWindowExpiresAt: match.reportWindowExpiresAt,
    dispute: match.dispute ? { id: match.dispute.id, status: match.dispute.status, organizerDeadline: match.dispute.organizerRulingDeadline } : null,
    opponentReport,
    reports: reportRows,
    playBy,
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
