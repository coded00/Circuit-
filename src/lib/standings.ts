/**
 * Circuit — shared win/loss standings computation (Build Plan P4-5, maps:
 * BTL-5). Originally lived only in the ladder page; extracted once the
 * NEXA-rebuild's homepage leaderboard and per-game profile rank chips also
 * needed the exact same aggregation.
 */

import { prisma } from "@/lib/db";

export type Standing = { userId: string; displayName: string; handle: string; wins: number; losses: number };

type StandingMatch = {
  winnerId: string | null;
  playerAId: string;
  playerBId: string;
  playerA: { displayName: string; handle: string };
  playerB: { displayName: string; handle: string };
};

/** Pure aggregation — pass in whatever COMPLETE matches should count. */
export function computeStandings(matches: StandingMatch[]): Standing[] {
  const standings = new Map<string, Standing>();
  function ensure(userId: string, displayName: string, handle: string): Standing {
    let s = standings.get(userId);
    if (!s) {
      s = { userId, displayName, handle, wins: 0, losses: 0 };
      standings.set(userId, s);
    }
    return s;
  }

  for (const match of matches) {
    if (!match.winnerId) continue; // shouldn't happen for COMPLETE, defensive
    const a = ensure(match.playerAId, match.playerA.displayName, match.playerA.handle);
    const b = ensure(match.playerBId, match.playerB.displayName, match.playerB.handle);
    if (match.winnerId === match.playerAId) {
      a.wins++;
      b.losses++;
    } else {
      b.wins++;
      a.losses++;
    }
  }

  return [...standings.values()].sort((x, y) => y.wins - x.wins || x.losses - y.losses);
}

/** Per-game ladder standings — same query the ladder page runs. */
export async function gameStandings(game: string): Promise<Standing[]> {
  const matches = await prisma.match.findMany({
    where: { status: "COMPLETE", battle: { game, status: "COMPLETE" } },
    select: {
      winnerId: true,
      playerAId: true,
      playerBId: true,
      playerA: { select: { displayName: true, handle: true } },
      playerB: { select: { displayName: true, handle: true } },
    },
  });
  return computeStandings(matches);
}

/** Cross-game standings — every completed Battle match, regardless of game. */
export async function globalStandings(): Promise<Standing[]> {
  const matches = await prisma.match.findMany({
    where: { status: "COMPLETE", battle: { status: "COMPLETE" } },
    select: {
      winnerId: true,
      playerAId: true,
      playerBId: true,
      playerA: { select: { displayName: true, handle: true } },
      playerB: { select: { displayName: true, handle: true } },
    },
  });
  return computeStandings(matches);
}

/** This player's rank within one game's standings, or null if they haven't played it. */
export async function playerRankInGame(game: string, userId: string): Promise<number | null> {
  const standings = await gameStandings(game);
  const index = standings.findIndex((s) => s.userId === userId);
  return index === -1 ? null : index + 1;
}
