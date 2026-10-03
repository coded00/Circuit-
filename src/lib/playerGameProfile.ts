/**
 * Circuit — one player's record in one game, built only from their real,
 * finished matches and entries: wins, losses and draws, win rate, streaks,
 * recent form, match history, tournaments entered, the Challenge ranking,
 * and the achievements those numbers support. Everything here comes from
 * results both sides confirmed (or a ruling decided).
 */

import { prisma } from "@/lib/db";
import { DRAW_RESULT } from "@/lib/leagueTable";
import { playerRankInGame } from "@/lib/standings";
import { slugify } from "@/lib/seo";

type GameMatch = {
  id: string;
  at: Date;
  opponent: { handle: string; displayName: string };
  context: string;
  /** VOID: ruled void, counts toward nothing. */
  result: "W" | "L" | "D" | "VOID";
  score: string | null;
};

type GameAchievement = { key: string; label: string; description: string; unlocked: boolean; current: number; target: number };

export type PlayerGameProfile = {
  game: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number | null;
  /** Current run, latest first. */
  streak: { result: "W" | "L"; count: number } | null;
  bestWinRun: number;
  /** Latest first, at most 10. */
  form: ("W" | "L" | "D")[];
  rank: number | null;
  matches: GameMatch[];
  tournaments: { id: string; name: string; status: string; startAt: Date }[];
  achievements: GameAchievement[];
};

type Report = { winnerId: string; score: string };

/** The game this URL names, among those the player has played, listed, or that Circuit offers. */
export async function resolveGameSlug(userId: string, favoriteGames: string[], slug: string): Promise<string | null> {
  const [catalog, tournamentGames, battleGames] = await Promise.all([
    prisma.game.findMany({ where: { enabled: true, publishedAt: { not: null } }, select: { name: true } }),
    prisma.tournament.findMany({ where: { registrations: { some: { userId, status: "CONFIRMED" } } }, select: { game: true }, distinct: ["game"] }),
    prisma.battle.findMany({ where: { OR: [{ creatorId: userId }, { matches: { some: { OR: [{ playerAId: userId }, { playerBId: userId }] } } }] }, select: { game: true }, distinct: ["game"] }),
  ]);
  const names = new Set([...catalog.map((g) => g.name), ...favoriteGames, ...tournamentGames.map((t) => t.game), ...battleGames.map((b) => b.game)]);
  return [...names].find((n) => slugify(n) === slug) ?? null;
}

export async function getPlayerGameProfile(userId: string, game: string): Promise<PlayerGameProfile> {
  const [rows, registrations, rank] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: "COMPLETE",
        OR: [{ playerAId: userId }, { playerBId: userId }],
        AND: [{ OR: [{ battle: { game } }, { tournament: { game } }] }],
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        updatedAt: true,
        winnerId: true,
        resultA: true,
        resultB: true,
        playerAId: true,
        playerA: { select: { handle: true, displayName: true } },
        playerB: { select: { handle: true, displayName: true } },
        tournament: { select: { name: true } },
      },
    }),
    prisma.registration.findMany({
      where: { userId, status: "CONFIRMED", tournament: { game } },
      orderBy: { tournament: { startAt: "desc" } },
      take: 20,
      select: { tournament: { select: { id: true, name: true, status: true, startAt: true } } },
    }),
    playerRankInGame(game, userId),
  ]);

  const matches: GameMatch[] = rows.map((m) => {
    const reports = [m.resultA, m.resultB].filter(Boolean) as unknown as Report[];
    const draw = !m.winnerId && reports.some((r) => r.winnerId === DRAW_RESULT);
    const result: GameMatch["result"] = m.winnerId === userId ? "W" : m.winnerId ? "L" : draw ? "D" : "VOID";
    const accepted = reports.find((r) => r.winnerId === (m.winnerId ?? DRAW_RESULT));
    return {
      id: m.id,
      at: m.updatedAt,
      opponent: m.playerAId === userId ? m.playerB : m.playerA,
      context: m.tournament?.name ?? "Challenge",
      result,
      score: accepted?.score ?? null,
    };
  });
  // A voided match counts toward nothing.
  const decided = matches.filter((m): m is GameMatch & { result: "W" | "L" | "D" } => m.result !== "VOID");

  const wins = decided.filter((m) => m.result === "W").length;
  const losses = decided.filter((m) => m.result === "L").length;
  const draws = decided.filter((m) => m.result === "D").length;
  const played = decided.length;

  const lead = decided[0]?.result;
  let streakCount = 0;
  while (streakCount < decided.length && decided[streakCount].result === lead) streakCount++;
  const streak = lead === "W" || lead === "L" ? { result: lead, count: streakCount } : null;

  let bestWinRun = 0;
  for (let i = 0, run = 0; i < decided.length; i++) {
    run = decided[i].result === "W" ? run + 1 : 0;
    bestWinRun = Math.max(bestWinRun, run);
  }

  const tournaments = registrations.map((r) => r.tournament);
  const achievements: GameAchievement[] = [
    { key: "first-win", label: "First Win", description: `Won a match in ${game}`, current: wins, target: 1 },
    { key: "five-wins", label: "5 Wins", description: `Won 5 matches in ${game}`, current: wins, target: 5 },
    { key: "hot-streak", label: "Hot Streak", description: `Won 3 in a row in ${game}`, current: bestWinRun, target: 3 },
    { key: "tournament-player", label: "Tournament Player", description: `Entered a ${game} tournament`, current: tournaments.length, target: 1 },
  ].map((a) => ({ ...a, unlocked: a.current >= a.target }));

  return {
    game,
    played,
    wins,
    losses,
    draws,
    winRate: played === 0 ? null : Math.round((wins / played) * 100),
    streak,
    bestWinRun,
    form: decided.slice(0, 10).map((m) => m.result),
    rank,
    matches: matches.slice(0, 25),
    tournaments,
    achievements,
  };
}
