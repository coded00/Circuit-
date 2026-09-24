/**
 * Circuit — public player profile (Build Plan P3-10, maps: BRK-8, ACC-6).
 * No login required — guest-visible like everything else (ACC-1).
 * `dateOfBirth` and `payoutMethodRef` stay private (edited at /account,
 * never rendered here) — the Wallet tab (real balance + real transaction
 * totals) and the "Needs your attention" list are owner-only.
 *
 * This file does every query and derivation; ProfileView.tsx renders.
 * Everything shown is derived from real rows:
 * - Record / win rate / form / streak come from completed matches (a
 *   match with no winner is a void and counts toward neither side).
 * - Best rank and per-game ranks come from `playerRankInGame` (Battle
 *   standings — the only ranking Circuit has).
 * - Achievements are the same four derived badges as before, now with
 *   real progress toward each one; there's no stored achievements system.
 * - Favourite games are self-curated (`User.favoriteGames`, /account).
 * - There is no level/XP system, so the profile shows none.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { playerRankInGame } from "@/lib/standings";
import { getWalletActivity } from "@/lib/wallet";
import { friendStatusBetween } from "@/lib/friends";
import { matchStatusInfo } from "@/components/StatusPill";
import { ProfileView, type AttentionItem, type MatchSummary, type ProfileData } from "./ProfileView";

const ACTIVE_MATCH_PRIORITY: Record<string, number> = { DISPUTED: 0, NEEDS_RESULT: 1, UPCOMING: 2 };

/** Old tab keys (from links made before tabs were consolidated) → current tab. */
const TAB_ALIASES: Record<string, string> = {
  overview: "overview",
  matches: "matches",
  stats: "matches",
  achievements: "overview",
  tournaments: "tournaments",
  friends: "friends",
  teams: "teams",
  wallet: "wallet",
};

export default async function PlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ handle }, { tab }] = await Promise.all([params, searchParams]);

  const player = await prisma.user.findUnique({ where: { handle } });
  if (!player) notFound();

  const viewer = await getCurrentUser();
  const isOwnProfile = viewer?.id === player.id;
  const friendStatus = viewer && !isOwnProfile ? await friendStatusBetween(viewer.id, player.id) : null;

  const [
    activeMatches,
    activeRegistrations,
    openBattles,
    allRegistrations,
    walletActivity,
    matches,
    incomingRequests,
    outgoingRequests,
    acceptedFriendships,
    captainedTeams,
    memberTeams,
    teamInvites,
    teamRequests,
  ] = await Promise.all([
    isOwnProfile
      ? prisma.match.findMany({
          where: {
            OR: [{ playerAId: player.id }, { playerBId: player.id }],
            status: { in: ["UPCOMING", "NEEDS_RESULT", "DISPUTED"] },
          },
          orderBy: { createdAt: "desc" },
          include: {
            playerA: { select: { displayName: true } },
            playerB: { select: { displayName: true } },
            tournament: { select: { name: true } },
            battle: { select: { game: true } },
          },
        })
      : Promise.resolve([]),
    isOwnProfile
      ? prisma.registration.findMany({
          where: { userId: player.id, status: "CONFIRMED", tournament: { status: { in: ["OPEN", "LIVE"] } } },
          include: { tournament: { select: { id: true, name: true, game: true, status: true } } },
        })
      : Promise.resolve([]),
    isOwnProfile
      ? prisma.battle.findMany({ where: { creatorId: player.id, status: "OPEN" }, select: { id: true, game: true, format: true } })
      : Promise.resolve([]),
    prisma.registration.findMany({
      where: { userId: player.id },
      orderBy: { createdAt: "desc" },
      include: { tournament: { select: { id: true, name: true, game: true, status: true, startAt: true } } },
    }),
    isOwnProfile ? getWalletActivity(player.id) : Promise.resolve(null),
    prisma.match.findMany({
      where: { status: "COMPLETE", OR: [{ playerAId: player.id }, { playerBId: player.id }] },
      orderBy: { createdAt: "desc" },
      include: {
        playerA: { select: { displayName: true, handle: true } },
        playerB: { select: { displayName: true, handle: true } },
        tournament: { select: { name: true, game: true } },
        battle: { select: { game: true } },
      },
    }),
    // Friends & Teams: the accepted lists are public on every profile;
    // pending requests/invites are only ever fetched for the owner.
    isOwnProfile
      ? prisma.friendship.findMany({
          where: { addresseeId: player.id, accepted: false },
          orderBy: { createdAt: "desc" },
          include: { requester: { select: { handle: true, displayName: true, avatarUrl: true } } },
        })
      : Promise.resolve([]),
    isOwnProfile
      ? prisma.friendship.findMany({
          where: { requesterId: player.id, accepted: false },
          orderBy: { createdAt: "desc" },
          include: { addressee: { select: { handle: true, displayName: true, avatarUrl: true } } },
        })
      : Promise.resolve([]),
    prisma.friendship.findMany({
      where: { accepted: true, OR: [{ requesterId: player.id }, { addresseeId: player.id }] },
      orderBy: { createdAt: "desc" },
      include: {
        requester: { select: { handle: true, displayName: true, avatarUrl: true } },
        addressee: { select: { handle: true, displayName: true, avatarUrl: true } },
      },
    }),
    prisma.team.findMany({ where: { captainId: player.id }, orderBy: { createdAt: "desc" } }),
    prisma.teamMembership.findMany({
      where: { userId: player.id, accepted: true, team: { captainId: { not: player.id } } },
      include: { team: true },
      orderBy: { createdAt: "desc" },
    }),
    isOwnProfile
      ? prisma.teamMembership.findMany({
          where: { userId: player.id, accepted: false, requestedByMember: false },
          include: { team: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    isOwnProfile
      ? prisma.teamMembership.findMany({
          where: { userId: player.id, accepted: false, requestedByMember: true },
          include: { team: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  // --- Record, form, streak ------------------------------------------------
  const matchSummaries: MatchSummary[] = matches.map((m) => ({
    id: m.id,
    opponent: m.playerAId === player.id ? m.playerB : m.playerA,
    context: m.tournament?.name ?? "Challenge",
    game: m.battle?.game ?? m.tournament?.game ?? null,
    date: m.createdAt,
    result: !m.winnerId ? "VOID" : m.winnerId === player.id ? "W" : "L",
  }));
  const decided = matchSummaries.filter((m) => m.result !== "VOID").map((m) => m.result as "W" | "L");
  const wins = decided.filter((r) => r === "W").length;
  const losses = decided.length - wins;
  const played = decided.length;
  const winRate = played === 0 ? null : Math.round((wins / played) * 100);
  let streakCount = 0;
  while (streakCount < decided.length && decided[streakCount] === decided[0]) streakCount++;
  const streak = decided.length > 0 ? { result: decided[0], count: streakCount } : null;

  // --- Per-game stats + ranks ---------------------------------------------
  // Every completed match with a known game counts toward that game's
  // record; ranks come from Battle standings (null where unranked).
  const games = [...new Set(matchSummaries.map((m) => m.game).filter((g): g is string => Boolean(g)))];
  const ranks = new Map(await Promise.all(games.map(async (game) => [game, await playerRankInGame(game, player.id)] as const)));
  const gameStats = games
    .map((game) => {
      const results = matchSummaries.filter((m) => m.game === game);
      const gWins = results.filter((m) => m.result === "W").length;
      const gLosses = results.filter((m) => m.result === "L").length;
      const gPlayed = gWins + gLosses;
      return {
        game,
        wins: gWins,
        losses: gLosses,
        played: gPlayed,
        winRate: gPlayed === 0 ? null : Math.round((gWins / gPlayed) * 100),
        rank: ranks.get(game) ?? null,
      };
    })
    .sort((a, b) => b.played - a.played);
  const bestRank = gameStats
    .filter((g): g is typeof g & { rank: number } => g.rank !== null)
    .sort((a, b) => a.rank - b.rank)[0];

  // --- Achievements (derived, with real progress) --------------------------
  const tournamentsJoined = allRegistrations.filter((r) => r.status === "CONFIRMED").length;
  const achievements: ProfileData["achievements"] = [
    { key: "first-match", label: "First Match", description: "Played a first match", unlocked: played >= 1, progress: { current: played, target: 1 } },
    { key: "five-wins", label: "5 Wins", description: "Won 5 matches", unlocked: wins >= 5, progress: { current: wins, target: 5 } },
    {
      key: "tournament-player",
      label: "Tournament Player",
      description: "Joined a tournament",
      unlocked: tournamentsJoined >= 1,
      progress: { current: tournamentsJoined, target: 1 },
    },
    { key: "top-10", label: "Top 10", description: "Ranked top 10 in a game", unlocked: (bestRank?.rank ?? 99) <= 10, progress: null },
  ];

  // --- Needs your attention (owner only) -----------------------------------
  activeMatches.sort((a, b) => ACTIVE_MATCH_PRIORITY[a.status] - ACTIVE_MATCH_PRIORITY[b.status]);
  const attention: AttentionItem[] = [
    ...activeMatches.map((m): AttentionItem => {
      const opponent = m.playerAId === player.id ? m.playerB : m.playerA;
      const status = matchStatusInfo(m.status);
      return {
        id: `match-${m.id}`,
        href: `/matches/${m.id}`,
        kind: "match",
        title: `vs ${opponent.displayName}`,
        subtitle: `${m.tournament?.name ?? `Challenge · ${m.battle?.game}`} · Code ${m.matchCode}`,
        status,
      };
    }),
    ...activeRegistrations.map(
      (r): AttentionItem => ({
        id: `reg-${r.id}`,
        href: `/tournaments/${r.tournament.id}`,
        kind: "registration",
        title: r.tournament.name,
        subtitle: `You're registered · ${r.tournament.game}`,
        status: r.tournament.status === "LIVE" ? { tone: "live", label: "Live", pulse: true } : { tone: "open", label: "Registered" },
      })
    ),
    ...openBattles.map(
      (b): AttentionItem => ({
        id: `battle-${b.id}`,
        href: `/battles/${b.id}`,
        kind: "battle",
        title: `Your open Challenge · ${b.game}`,
        subtitle: "Waiting for an opponent",
      })
    ),
  ];

  const data: ProfileData = {
    player: {
      handle: player.handle,
      displayName: player.displayName,
      avatarUrl: player.avatarUrl,
      bio: player.bio,
      region: player.region,
      favoriteGames: player.favoriteGames,
      createdAt: player.createdAt,
    },
    isOwnProfile,
    viewerSignedIn: Boolean(viewer),
    friendStatus,
    profileUrl: `${process.env.NEXT_PUBLIC_APP_URL}/players/${player.handle}`,
    stats: {
      wins,
      losses,
      played,
      winRate,
      streak,
      tournaments: tournamentsJoined,
      bestRank: bestRank ? { rank: bestRank.rank, game: bestRank.game } : null,
    },
    form: decided.slice(0, 10),
    matches: matchSummaries,
    gameStats,
    achievements,
    attention,
    registrations: allRegistrations.map((r) => ({
      id: r.id,
      tournamentId: r.tournament.id,
      name: r.tournament.name,
      game: r.tournament.game,
      startAt: r.tournament.startAt,
      status: r.status,
    })),
    friends: {
      accepted: acceptedFriendships.map((f) => ({
        friendshipId: f.id,
        ...(f.requesterId === player.id ? f.addressee : f.requester),
      })),
      incoming: incomingRequests.map((f) => ({ friendshipId: f.id, ...f.requester })),
      outgoing: outgoingRequests.map((f) => ({ friendshipId: f.id, ...f.addressee })),
    },
    teams: {
      mine: [
        ...captainedTeams.map((t) => ({ id: t.id, name: t.name, tag: t.tag, game: t.game, isCaptain: true })),
        ...memberTeams.map((m) => ({ id: m.team.id, name: m.team.name, tag: m.team.tag, game: m.team.game, isCaptain: false })),
      ],
      invites: teamInvites.map((m) => ({ id: m.id, teamId: m.teamId, name: m.team.name, tag: m.team.tag })),
      requests: teamRequests.map((m) => ({ id: m.id, teamId: m.teamId, name: m.team.name, tag: m.team.tag })),
    },
    wallet: walletActivity
      ? {
          balance: walletActivity.balance,
          totalPaid: walletActivity.totalPaid,
          totalRefunded: walletActivity.totalRefunded,
          totalWon: walletActivity.totalWon,
        }
      : null,
    initialTab: tab ? TAB_ALIASES[tab] : undefined,
  };

  return <ProfileView data={data} viewerId={viewer?.id ?? null} />;
}
