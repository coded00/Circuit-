/**
 * Circuit — live bracket view (Build Plan P3-9, maps: BRK-7). Thin
 * data-fetcher; the real tab shell (Bracket / Matches / Standings /
 * About) and Champion sidebar live in `BracketView.tsx`, shared with the
 * admin-native bracket page at `/admin/competitions/[id]/bracket` — see
 * that file's own header comment for what's real vs. deliberately not
 * invented (round names, standings, no per-match score split, etc.).
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Poller from "@/app/Poller";
import { playerRankInGame } from "@/lib/standings";
import { computeTopFragger } from "@/lib/awards";
import { asTeam, teamEntryLabels } from "@/lib/teamEntries";
import { BracketView, type BracketStructure } from "./BracketView";
import { renderLobbyStandings } from "./lobbyPage";
import { RoundRobinStandings } from "./RoundRobinStandings";
import { loadLeagueStandings } from "@/lib/roundRobinStandings";
import { getCurrentUser } from "@/lib/session";
import { DoubleElimView } from "./DoubleElimView";
import { isDoubleElimStructure } from "@/lib/doubleElim";

export default async function BracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { organizer: { select: { verified: true, user: { select: { displayName: true, handle: true } } } } },
  });
  if (!tournament) notFound();

  // Lobby tournaments have rounds and a leaderboard instead of a bracket.
  if (tournament.competitionStyle === "LOBBY") {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
        <Poller />
        {await renderLobbyStandings(tournament, { backHref: `/tournaments/${id}`, shareUrl: `${process.env.NEXT_PUBLIC_APP_URL}/tournaments/${id}/bracket` })}
      </div>
    );
  }

  if (tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") {
    const [view, viewer] = await Promise.all([loadLeagueStandings(tournament), getCurrentUser()]);
    if (view) {
      return (
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
          <Poller />
          <RoundRobinStandings
            tournament={tournament}
            view={view}
            viewerId={viewer?.id ?? null}
            backHref={`/tournaments/${id}`}
            matchHrefBase="/matches"
            shareUrl={`${process.env.NEXT_PUBLIC_APP_URL}/tournaments/${id}/bracket`}
          />
        </div>
      );
    }
  }

  if (tournament.format === "DOUBLE_ELIMINATION") {
    const bracketRow = await prisma.bracket.findUnique({ where: { tournamentId: id } });
    if (isDoubleElimStructure(bracketRow?.structure)) {
      const structure = bracketRow.structure;
      const ids = [...new Set(structure.nodes.flatMap((n) => [n.playerAId, n.playerBId]).filter((x): x is string => !!x))];
      const [people, labels, matchRows, viewer] = await Promise.all([
        prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, handle: true } }),
        teamEntryLabels(id),
        prisma.match.findMany({ where: { tournamentId: id }, select: { id: true, status: true } }),
        getCurrentUser(),
      ]);
      const deView = (
        <DoubleElimView
          tournament={tournament}
          structure={structure}
          people={people.map((p) => ({ ...p, displayName: labels.get(p.id)?.teamName ?? p.displayName }))}
          statuses={Object.fromEntries(matchRows.map((m) => [m.id, m.status]))}
          viewerId={viewer?.id ?? null}
          backHref={`/tournaments/${id}`}
          matchHrefBase="/matches"
          shareUrl={`${process.env.NEXT_PUBLIC_APP_URL}/tournaments/${id}/bracket`}
        />
      );
      return (
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
          <Poller />
          {deView}
        </div>
      );
    }
  }

  const bracket = await prisma.bracket.findUnique({ where: { tournamentId: id } });
  if (!bracket) {
    return (
      <div className="state-block motion-fade-in">
        {/* Same live-page treatment as once the bracket exists below —
            no reason a viewer waiting for registration to close should
            need a manual refresh to see it appear. */}
        <Poller />
        <h1 className="state-title">{tournament.name}</h1>
        <p className="state-description">
          The bracket hasn&apos;t been generated yet — it appears once registration closes.
        </p>
      </div>
    );
  }

  const structure = bracket.structure as unknown as BracketStructure;
  const userIds = new Set<string>();
  for (const round of structure.rounds) {
    for (const slot of round.slots) {
      if (slot.playerAId) userIds.add(slot.playerAId);
      if (slot.playerBId) userIds.add(slot.playerBId);
    }
  }
  const rawUsers = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, displayName: true, handle: true, avatarUrl: true },
  });

  const rawMatches = await prisma.match.findMany({
    where: { tournamentId: id },
    orderBy: [{ round: "asc" }, { createdAt: "asc" }],
    include: {
      playerA: { select: { displayName: true, handle: true, avatarUrl: true } },
      playerB: { select: { displayName: true, handle: true, avatarUrl: true } },
    },
  });

  // Team tournaments: show the team, not the captain who holds the slot.
  const labels = await teamEntryLabels(id);
  const users = rawUsers.map((u) => asTeam(u, u.id, labels));
  const matches = rawMatches.map((m) => ({
    ...m,
    playerA: asTeam(m.playerA, m.playerAId, labels),
    playerB: asTeam(m.playerB, m.playerBId, labels),
  }));

  const champion = structure.rounds[structure.totalRounds - 1]?.slots[0]?.winnerId ?? null;
  const championRank = champion ? await playerRankInGame(tournament.game, champion) : null;
  const topFragger = await computeTopFragger(id);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <Poller />
      <BracketView
        tournament={tournament}
        structure={structure}
        users={users}
        matches={matches}
        championRank={championRank}
        topFragger={topFragger}
        backHref={`/tournaments/${id}`}
        matchHrefBase="/matches"
        playerHref={(_userId, handle) => `/players/${handle}`}
        tournamentHref={`/tournaments/${id}`}
        shareUrl={`${process.env.NEXT_PUBLIC_APP_URL}/tournaments/${id}/bracket`}
      />
    </div>
  );
}
