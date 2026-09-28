/**
 * Circuit — loads and renders a lobby tournament's standings for the
 * public and admin bracket routes (they differ only in links).
 */

import type { Tournament } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canManageLobby, loadLobby, loadRoomDetails } from "@/lib/lobby";
import { LobbyStandings } from "./LobbyStandings";

export async function renderLobbyStandings(tournament: Tournament, links: { backHref: string; shareUrl?: string }) {
  const [view, viewer] = await Promise.all([loadLobby(tournament), getCurrentUser()]);
  // The entry the viewer plays in (as its user or on its roster), if any.
  const myEntry = viewer
    ? await prisma.registration.findFirst({
        where: { tournamentId: tournament.id, status: "CONFIRMED", OR: [{ userId: viewer.id }, { roster: { some: { userId: viewer.id } } }] },
        select: { id: true, lobbyGroup: true, lobbyFinalist: true },
      })
    : null;
  const viewerInTournament = !!myEntry;
  const isManager = canManageLobby(viewer, tournament);
  // Room details never reach anyone who isn't playing in that lobby or running it.
  const allRooms = viewerInTournament || isManager ? await loadRoomDetails(tournament.id) : null;
  const rooms =
    allRooms && !isManager
      ? allRooms.filter((r) => r.stage === "MAIN" || (r.stage === "GROUP" ? r.group === myEntry?.lobbyGroup : !!myEntry?.lobbyFinalist))
      : allRooms;
  return (
    <LobbyStandings
      tournament={tournament}
      view={view}
      viewer={viewer ? { id: viewer.id, isStaff: viewer.isStaff } : null}
      viewerInTournament={viewerInTournament}
      isManager={isManager}
      rooms={rooms}
      viewerEntryId={myEntry?.id ?? null}
      backHref={links.backHref}
      resultsHrefBase={`/tournaments/${tournament.id}/rounds`}
      shareUrl={links.shareUrl}
    />
  );
}
