/**
 * Circuit — Player Discovery (Phase 1: Foundation). One real, honest feed
 * of players you haven't already added — no fabricated skill rating, no
 * fake "online now" status, nothing here that isn't a real column or a
 * real aggregation over real rows.
 *
 * Shared by the server-rendered first page (src/app/discover/page.tsx) and
 * the "Load More" API route (src/app/api/discover/players/route.ts) so the
 * query lives in exactly one place — same reasoning as every other shared
 * lib in this codebase (src/lib/friends.ts, src/lib/standings.ts).
 *
 * Deliberately avoids N+1: enrichment (friend status, win/loss, mutual
 * friends) is computed from a couple of page-scoped queries covering every
 * user in the page at once, not one query per card.
 */

import { prisma } from "@/lib/db";
import { getFriendIds } from "@/lib/friends";
import { computeStandings } from "@/lib/standings";
import type { FriendButtonStatus } from "@/components/FriendButton"; // type-only import, erased at compile time

const DEFAULT_TAKE = 20;

export type DiscoveryPlayer = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  primaryGame: string | null;
  wins: number;
  losses: number;
  mutualFriends: number;
  friendStatus: FriendButtonStatus;
};

export type DiscoveryFilters = {
  /** Matches against displayName or handle. Real DB-level filter — doesn't affect pagination correctness. */
  q?: string;
  /** Matches against region (city/state/country free text). Real DB-level filter. */
  region?: string;
  /**
   * Matches against favoriteGames (case-insensitive substring, any entry).
   * favoriteGames is a String[] of free-typed names — Postgres/Prisma's
   * `has`/`hasSome` array operators only do exact, case-sensitive matches,
   * so this can't be pushed into the `where` clause the way q/region can.
   * Applied as a JS filter over an over-fetched batch instead (see
   * GAME_FILTER_OVERFETCH below) — at Circuit's real current scale this is
   * a non-issue; the known, disclosed tradeoff is that a single "page"
   * can come back shorter than `take` when this filter is active even if
   * more matches exist further back, same as /api/search's own disclosed
   * "no trigram index yet" performance caveat.
   */
  game?: string;
};

// Only used when a `game` filter is active — fetch a larger raw batch
// before the JS filter narrows it down, so one "Load More" click isn't
// usually starved down to near-zero real results.
const GAME_FILTER_OVERFETCH_MULTIPLIER = 5;

export async function getDiscoverablePlayers({
  viewerId,
  cursor,
  take = DEFAULT_TAKE,
  filters = {},
}: {
  viewerId: string;
  cursor?: string | null;
  take?: number;
  filters?: DiscoveryFilters;
}): Promise<{ players: DiscoveryPlayer[]; nextCursor: string | null }> {
  const viewerFriendIds = await getFriendIds(viewerId);
  const { q, region, game } = filters;
  const rawTake = game ? take * GAME_FILTER_OVERFETCH_MULTIPLIER : take;

  const rows = await prisma.user.findMany({
    where: {
      id: { notIn: [...viewerFriendIds, viewerId] },
      isSuspended: false,
      ...(q ? { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { handle: { contains: q, mode: "insensitive" } }] } : {}),
      ...(region ? { region: { contains: region, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: rawTake + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, handle: true, displayName: true, avatarUrl: true, bio: true, favoriteGames: true },
  });

  const hasMoreRaw = rows.length > rawTake;
  const rawPage = hasMoreRaw ? rows.slice(0, rawTake) : rows;
  // The cursor always advances by the last RAW row examined, not the last
  // matched one — so continuing "Load More" never re-scans rows already
  // looked at, even when the game filter drops most of a batch.
  const nextCursor = hasMoreRaw ? rawPage[rawPage.length - 1].id : null;

  const filtered = game
    ? rawPage.filter((u) => u.favoriteGames.some((g) => g.toLowerCase().includes(game.toLowerCase())))
    : rawPage;
  const page = filtered.slice(0, take);

  if (page.length === 0) return { players: [], nextCursor };

  const players = await enrichPlayers(viewerId, viewerFriendIds, page);
  return { players, nextCursor };
}

type CandidateUser = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  favoriteGames: string[];
};

/**
 * Turns a plain list of candidate User rows into real DiscoveryPlayer
 * cards — friend status, win/loss, mutual friends — via a fixed number of
 * queries covering every candidate at once, regardless of list size. Used
 * by the main feed above and by every personalized section in
 * src/lib/discoveryPersonalized.ts, so this N+1-avoidance logic lives in
 * exactly one place.
 */
export async function enrichPlayers(
  viewerId: string,
  viewerFriendIds: string[],
  candidates: CandidateUser[]
): Promise<DiscoveryPlayer[]> {
  if (candidates.length === 0) return [];

  const candidateIds = candidates.map((u) => u.id);
  const viewerFriendSet = new Set(viewerFriendIds);

  // One query covers every relationship (accepted or pending, either
  // direction) between the viewer and every candidate.
  const relationships = await prisma.friendship.findMany({
    where: {
      OR: [
        { requesterId: viewerId, addresseeId: { in: candidateIds } },
        { requesterId: { in: candidateIds }, addresseeId: viewerId },
      ],
    },
  });
  const relationshipByOtherId = new Map(relationships.map((r) => [r.requesterId === viewerId ? r.addresseeId : r.requesterId, r]));

  // One query covers every completed match involving any candidate, fed
  // straight into the same aggregation the ladder/profile pages use.
  const matches = await prisma.match.findMany({
    where: {
      status: "COMPLETE",
      OR: [{ playerAId: { in: candidateIds } }, { playerBId: { in: candidateIds } }],
    },
    select: {
      winnerId: true,
      playerAId: true,
      playerBId: true,
      playerA: { select: { displayName: true, handle: true, avatarUrl: true } },
      playerB: { select: { displayName: true, handle: true, avatarUrl: true } },
    },
  });
  const standingsByUserId = new Map(computeStandings(matches).map((s) => [s.userId, s]));

  // Mutual friends: every accepted friendship touching a candidate,
  // grouped into a per-candidate friend-id set, intersected with the
  // viewer's.
  const candidateFriendships = await prisma.friendship.findMany({
    where: { accepted: true, OR: [{ requesterId: { in: candidateIds } }, { addresseeId: { in: candidateIds } }] },
    select: { requesterId: true, addresseeId: true },
  });
  const friendIdsByUser = new Map<string, Set<string>>();
  for (const id of candidateIds) friendIdsByUser.set(id, new Set());
  for (const f of candidateFriendships) {
    if (friendIdsByUser.has(f.requesterId)) friendIdsByUser.get(f.requesterId)!.add(f.addresseeId);
    if (friendIdsByUser.has(f.addresseeId)) friendIdsByUser.get(f.addresseeId)!.add(f.requesterId);
  }

  return candidates.map((u) => {
    const relationship = relationshipByOtherId.get(u.id);
    const friendStatus: FriendButtonStatus = !relationship
      ? { state: "none" }
      : relationship.accepted
        ? { state: "friends", friendshipId: relationship.id }
        : relationship.requesterId === viewerId
          ? { state: "outgoing", friendshipId: relationship.id }
          : { state: "incoming", friendshipId: relationship.id };

    const standing = standingsByUserId.get(u.id);
    const theirFriends = friendIdsByUser.get(u.id) ?? new Set<string>();
    let mutualFriends = 0;
    for (const id of theirFriends) if (viewerFriendSet.has(id)) mutualFriends++;

    return {
      id: u.id,
      handle: u.handle,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      bio: u.bio,
      primaryGame: u.favoriteGames[0] ?? null,
      wins: standing?.wins ?? 0,
      losses: standing?.losses ?? 0,
      mutualFriends,
      friendStatus,
    };
  });
}
