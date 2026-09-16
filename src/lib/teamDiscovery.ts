/**
 * Circuit — Team Discovery (Phase 3). Same shape and same discipline as
 * src/lib/discovery.ts (Player Discovery): one real feed, no N+1, no
 * fabricated data. Team has no wired-up competitive results at all (see
 * that model's own schema comment — "a social grouping only"), so there's
 * deliberately no rank/recent-results field here, unlike players who have
 * real match history.
 */

import { prisma } from "@/lib/db";
import { getTeamIdsForUser } from "@/lib/teams";
import type { TeamMembershipStatus } from "@/components/teams/TeamMembershipButton"; // type-only, erased at compile time

const DEFAULT_TAKE = 20;

export type DiscoveryTeam = {
  id: string;
  name: string;
  tag: string | null;
  game: string | null;
  region: string | null;
  memberCount: number;
  captainHandle: string;
  captainDisplayName: string;
  membershipStatus: TeamMembershipStatus;
};

export type TeamDiscoveryFilters = {
  q?: string;
  game?: string;
  region?: string;
};

export async function getDiscoverableTeams({
  viewerId,
  cursor,
  take = DEFAULT_TAKE,
  filters = {},
}: {
  viewerId: string;
  cursor?: string | null;
  take?: number;
  filters?: TeamDiscoveryFilters;
}): Promise<{ teams: DiscoveryTeam[]; nextCursor: string | null }> {
  const myTeamIds = await getTeamIdsForUser(viewerId);
  const { q, game, region } = filters;

  const rows = await prisma.team.findMany({
    where: {
      id: { notIn: myTeamIds },
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(game ? { game: { contains: game, mode: "insensitive" } } : {}),
      ...(region ? { region: { contains: region, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      captain: { select: { handle: true, displayName: true } },
      _count: { select: { members: { where: { accepted: true } } } },
    },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  if (page.length === 0) return { teams: [], nextCursor };

  const teams = await enrichTeams(viewerId, page);
  return { teams, nextCursor };
}

type CandidateTeam = {
  id: string;
  name: string;
  tag: string | null;
  game: string | null;
  region: string | null;
  captain: { handle: string; displayName: string };
  _count: { members: number };
};

/** Same reasoning as discovery.ts's enrichPlayers — one query covering every candidate's membership status, not one per card. */
async function enrichTeams(viewerId: string, candidates: CandidateTeam[]): Promise<DiscoveryTeam[]> {
  if (candidates.length === 0) return [];

  const teamIds = candidates.map((t) => t.id);
  const memberships = await prisma.teamMembership.findMany({
    where: { userId: viewerId, teamId: { in: teamIds } },
    select: { teamId: true, accepted: true, requestedByMember: true, id: true },
  });
  const membershipByTeamId = new Map(memberships.map((m) => [m.teamId, m]));

  return candidates.map((t) => {
    const membership = membershipByTeamId.get(t.id);
    const membershipStatus: TeamMembershipStatus = !membership
      ? { state: "none" }
      : membership.accepted
        ? { state: "member" }
        : membership.requestedByMember
          ? { state: "requested", membershipId: membership.id }
          : { state: "invited", membershipId: membership.id };

    return {
      id: t.id,
      name: t.name,
      tag: t.tag,
      game: t.game,
      region: t.region,
      memberCount: t._count.members,
      captainHandle: t.captain.handle,
      captainDisplayName: t.captain.displayName,
      membershipStatus,
    };
  });
}

const RECOMMENDED_TEAMS_SIZE = 8;

/**
 * Phase 4 — "Teams playing your games." Real overlap with the viewer's
 * own self-reported favoriteGames, same case-insensitive-substring
 * reasoning as discoveryPersonalized.ts's player equivalent. Only
 * meaningful (and only called) when the viewer has favoriteGames set.
 */
export async function getRecommendedTeams(viewerId: string, favoriteGames: string[]): Promise<DiscoveryTeam[]> {
  if (favoriteGames.length === 0) return [];

  const myTeamIds = await getTeamIdsForUser(viewerId);
  const gamesLower = favoriteGames.map((g) => g.toLowerCase());

  const candidates = await prisma.team.findMany({
    where: {
      id: { notIn: myTeamIds },
      OR: gamesLower.map((g) => ({ game: { contains: g, mode: "insensitive" as const } })),
    },
    orderBy: { createdAt: "desc" },
    take: RECOMMENDED_TEAMS_SIZE,
    include: {
      captain: { select: { handle: true, displayName: true } },
      _count: { select: { members: { where: { accepted: true } } } },
    },
  });

  return enrichTeams(viewerId, candidates);
}
