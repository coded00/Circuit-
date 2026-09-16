/**
 * Circuit — Personalized Discovery (Phase 4). Every section below is a
 * real, derivable signal — nothing here is a fabricated rating, a fake
 * "online now" flag, or a made-up recommendation score. Two signals from
 * the original spec are deliberately not built: "similar skill level" is
 * approximated from real win/loss buckets (there's no ELO/rating field
 * anywhere in the schema — see discovery.ts's own header comment), and
 * "active around the same time" (time-of-day pattern matching) has no
 * real data to derive from at all — Circuit has no session/login
 * timestamps, only occasional content-creation timestamps, so it's
 * omitted rather than faked.
 *
 * Each section fetches its own bounded candidate pool (excluding the
 * viewer and existing friends) and reuses enrichPlayers from discovery.ts
 * for the same N+1-avoidance enrichment the main feed uses — one extra
 * query per section, not one per card.
 */

import { prisma } from "@/lib/db";
import { getFriendIds } from "@/lib/friends";
import { computeStandings } from "@/lib/standings";
import { enrichPlayers, type DiscoveryPlayer } from "@/lib/discovery";

const SECTION_SIZE = 8;
// How many non-friend/non-self users to consider before ranking within a
// section — real bound, not "all users," so this stays cheap regardless
// of how many sections need their own candidate-ranking pass. Circuit's
// real current scale makes this a non-issue; worth revisiting only if the
// platform's real user count grows into the tens of thousands.
const CANDIDATE_POOL_SIZE = 300;

export type DiscoverySection = {
  key: string;
  title: string;
  players: DiscoveryPlayer[];
};

type BaseCandidate = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  favoriteGames: string[];
  region: string | null;
  createdAt: Date;
};

function skillBucket(wins: number, losses: number): "new" | "developing" | "experienced" | "elite" {
  const played = wins + losses;
  if (played === 0) return "new";
  if (wins < 5) return "developing";
  if (wins < 15) return "experienced";
  return "elite";
}

export async function getPersonalizedSections(viewerId: string): Promise<DiscoverySection[]> {
  const viewer = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { favoriteGames: true, region: true },
  });
  if (!viewer) return [];

  const viewerFriendIds = await getFriendIds(viewerId);
  const excludeIds = [...viewerFriendIds, viewerId];

  const pool = await prisma.user.findMany({
    where: { id: { notIn: excludeIds }, isSuspended: false },
    orderBy: { createdAt: "desc" },
    take: CANDIDATE_POOL_SIZE,
    select: {
      id: true,
      handle: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      favoriteGames: true,
      region: true,
      createdAt: true,
    },
  });
  if (pool.length === 0) return [];

  const sections: DiscoverySection[] = [];

  // 1. Players you may know — ranked by real mutual-friend count. The
  // single most valuable "who do I know" signal, computed from one
  // friendship query covering every one of the viewer's friends' own
  // friends, not a per-candidate lookup.
  if (viewerFriendIds.length > 0) {
    const friendsOfFriends = await prisma.friendship.findMany({
      where: { accepted: true, OR: [{ requesterId: { in: viewerFriendIds } }, { addresseeId: { in: viewerFriendIds } }] },
      select: { requesterId: true, addresseeId: true },
    });
    const mutualCountByCandidate = new Map<string, number>();
    for (const f of friendsOfFriends) {
      for (const side of [f.requesterId, f.addresseeId]) {
        if (excludeIds.includes(side)) continue;
        mutualCountByCandidate.set(side, (mutualCountByCandidate.get(side) ?? 0) + 1);
      }
    }
    const ranked = [...mutualCountByCandidate.entries()].sort((a, b) => b[1] - a[1]).slice(0, SECTION_SIZE);
    const candidates = ranked.map(([id]) => pool.find((u) => u.id === id)).filter((u): u is BaseCandidate => !!u);
    if (candidates.length > 0) {
      sections.push({ key: "mutual", title: "Players you may know", players: await enrichPlayers(viewerId, viewerFriendIds, candidates) });
    }
  }

  // 2. Players who play your games — real overlap with the viewer's own
  // self-reported favoriteGames. Case-insensitive substring, same
  // reasoning as the game filter's own JS-filter approach (discovery.ts).
  if (viewer.favoriteGames.length > 0) {
    const viewerGamesLower = viewer.favoriteGames.map((g) => g.toLowerCase());
    const candidates = pool
      .filter((u) => u.favoriteGames.some((g) => viewerGamesLower.some((vg) => g.toLowerCase().includes(vg) || vg.includes(g.toLowerCase()))))
      .slice(0, SECTION_SIZE);
    if (candidates.length > 0) {
      sections.push({ key: "same-games", title: "Players who play your games", players: await enrichPlayers(viewerId, viewerFriendIds, candidates) });
    }
  }

  // 3. Similar skill level — real win/loss buckets (see skillBucket's own
  // comment on why this is a bucket, not a fabricated rating).
  const viewerMatches = await prisma.match.findMany({
    where: { status: "COMPLETE", OR: [{ playerAId: viewerId }, { playerBId: viewerId }] },
    select: { winnerId: true, playerAId: true, playerBId: true },
  });
  const viewerWins = viewerMatches.filter((m) => m.winnerId === viewerId).length;
  const viewerLosses = viewerMatches.length - viewerWins;
  const viewerBucket = skillBucket(viewerWins, viewerLosses);

  const poolIds = pool.map((u) => u.id);
  const poolMatches = await prisma.match.findMany({
    where: { status: "COMPLETE", OR: [{ playerAId: { in: poolIds } }, { playerBId: { in: poolIds } }] },
    select: {
      winnerId: true,
      playerAId: true,
      playerBId: true,
      playerA: { select: { displayName: true, handle: true, avatarUrl: true } },
      playerB: { select: { displayName: true, handle: true, avatarUrl: true } },
    },
  });
  const poolStandings = new Map(computeStandings(poolMatches).map((s) => [s.userId, s]));
  const skillCandidates = pool
    .filter((u) => {
      const s = poolStandings.get(u.id);
      return skillBucket(s?.wins ?? 0, s?.losses ?? 0) === viewerBucket;
    })
    .slice(0, SECTION_SIZE);
  if (skillCandidates.length > 0) {
    sections.push({
      key: "skill",
      title: viewerBucket === "new" ? "New to Circuit, like you" : "Similar skill level",
      players: await enrichPlayers(viewerId, viewerFriendIds, skillCandidates),
    });
  }

  // 4. Recently active — real max(createdAt) across every match/
  // registration/battle a candidate actually has, not a fabricated
  // "online now" flag. Someone with zero real activity simply isn't
  // eligible for this section.
  const [recentMatches, recentRegistrations, recentBattles] = await Promise.all([
    prisma.match.findMany({
      where: { OR: [{ playerAId: { in: poolIds } }, { playerBId: { in: poolIds } }] },
      orderBy: { createdAt: "desc" },
      take: CANDIDATE_POOL_SIZE,
      select: { playerAId: true, playerBId: true, createdAt: true },
    }),
    prisma.registration.findMany({
      where: { userId: { in: poolIds } },
      orderBy: { createdAt: "desc" },
      take: CANDIDATE_POOL_SIZE,
      select: { userId: true, createdAt: true },
    }),
    prisma.battle.findMany({
      where: { creatorId: { in: poolIds } },
      orderBy: { createdAt: "desc" },
      take: CANDIDATE_POOL_SIZE,
      select: { creatorId: true, createdAt: true },
    }),
  ]);
  const lastActiveByUser = new Map<string, Date>();
  const bump = (userId: string, at: Date) => {
    const current = lastActiveByUser.get(userId);
    if (!current || at > current) lastActiveByUser.set(userId, at);
  };
  for (const m of recentMatches) {
    bump(m.playerAId, m.createdAt);
    bump(m.playerBId, m.createdAt);
  }
  for (const r of recentRegistrations) bump(r.userId, r.createdAt);
  for (const b of recentBattles) bump(b.creatorId, b.createdAt);

  const activeCandidates = [...lastActiveByUser.entries()]
    .sort((a, b) => b[1].getTime() - a[1].getTime())
    .slice(0, SECTION_SIZE)
    .map(([id]) => pool.find((u) => u.id === id))
    .filter((u): u is BaseCandidate => !!u);
  if (activeCandidates.length > 0) {
    sections.push({ key: "active", title: "Recently active players", players: await enrichPlayers(viewerId, viewerFriendIds, activeCandidates) });
  }

  // 5. Same region — real, self-reported region overlap.
  if (viewer.region) {
    const regionLower = viewer.region.toLowerCase();
    const candidates = pool.filter((u) => u.region && u.region.toLowerCase().includes(regionLower)).slice(0, SECTION_SIZE);
    if (candidates.length > 0) {
      sections.push({ key: "region", title: `Players near ${viewer.region}`, players: await enrichPlayers(viewerId, viewerFriendIds, candidates) });
    }
  }

  // 6. Popular on Circuit — ranked by real accepted-friend count, a
  // genuine social-proof signal distinct from skill (wins) or recency.
  const popularityFriendships = await prisma.friendship.findMany({
    where: { accepted: true, OR: [{ requesterId: { in: poolIds } }, { addresseeId: { in: poolIds } }] },
    select: { requesterId: true, addresseeId: true },
  });
  const friendCountByCandidate = new Map<string, number>();
  for (const f of popularityFriendships) {
    for (const side of [f.requesterId, f.addresseeId]) {
      if (poolIds.includes(side)) friendCountByCandidate.set(side, (friendCountByCandidate.get(side) ?? 0) + 1);
    }
  }
  const popularCandidates = [...friendCountByCandidate.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, SECTION_SIZE)
    .map(([id]) => pool.find((u) => u.id === id))
    .filter((u): u is BaseCandidate => !!u);
  if (popularCandidates.length > 0) {
    sections.push({ key: "popular", title: "Popular on Circuit", players: await enrichPlayers(viewerId, viewerFriendIds, popularCandidates) });
  }

  return sections;
}
