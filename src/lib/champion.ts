/**
 * Circuit — who won a tournament, shaped for the champion share page and
 * its og:image. Works for every structure: the final bracket match's
 * winner, or the top of a lobby leaderboard (tournamentWinnerId), and
 * shows the team rather than its captain for team entries.
 */

import { prisma } from "@/lib/db";
import { loadLobby, tournamentWinnerId } from "@/lib/lobby";
import { teamEntryLabels } from "@/lib/teamEntries";

export type ChampionCard = {
  tournament: { id: string; name: string; game: string; prizeAmount: number | null; prizeText: string | null; posterUrl: string | null };
  champion: { displayName: string; handle: string; avatarUrl: string | null };
  /** Lobby tournaments: "27 pts · 13 kills". */
  lobbyLine: string | null;
};

export async function loadChampion(tournamentId: string): Promise<ChampionCard | null> {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return null;
  const championId = await tournamentWinnerId(tournament);
  if (!championId) return null;
  const [user, labels] = await Promise.all([
    prisma.user.findUnique({ where: { id: championId }, select: { displayName: true, handle: true, avatarUrl: true } }),
    teamEntryLabels(tournamentId),
  ]);
  if (!user) return null;
  const team = labels.get(championId);

  let lobbyLine: string | null = null;
  if (tournament.competitionStyle === "LOBBY") {
    const view = await loadLobby(tournament);
    const row = view.board.find((r) => r.registrationId === view.winner?.registrationId);
    if (row) lobbyLine = `${row.total} pts · ${row.kills} kills`;
  }

  return {
    tournament: {
      id: tournament.id,
      name: tournament.name,
      game: tournament.game,
      prizeAmount: tournament.prizeAmount,
      prizeText: tournament.prizeText,
      posterUrl: tournament.posterUrl,
    },
    champion: team ? { displayName: team.teamName, handle: user.handle, avatarUrl: null } : user,
    lobbyLine,
  };
}
