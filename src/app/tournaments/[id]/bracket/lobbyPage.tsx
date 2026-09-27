/**
 * Circuit — loads and renders a lobby tournament's standings for the
 * public and admin bracket routes (they differ only in links).
 */

import type { Tournament } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canManageLobby, loadLobby } from "@/lib/lobby";
import { LobbyStandings } from "./LobbyStandings";

export async function renderLobbyStandings(tournament: Tournament, links: { backHref: string; shareUrl?: string }) {
  const [view, viewer] = await Promise.all([loadLobby(tournament), getCurrentUser()]);
  const viewerInTournament = viewer
    ? (await prisma.registration.count({
        where: { tournamentId: tournament.id, status: "CONFIRMED", OR: [{ userId: viewer.id }, { roster: { some: { userId: viewer.id } } }] },
      })) > 0
    : false;
  return (
    <LobbyStandings
      tournament={tournament}
      view={view}
      viewer={viewer ? { id: viewer.id, isStaff: viewer.isStaff } : null}
      viewerInTournament={viewerInTournament}
      isManager={canManageLobby(viewer, tournament)}
      backHref={links.backHref}
      resultsHrefBase={`/tournaments/${tournament.id}/rounds`}
      shareUrl={links.shareUrl}
    />
  );
}
