/**
 * Circuit — win-share-card award derivation. Champion is already computed
 * inline wherever a bracket is rendered (`BracketView.computePlacements`);
 * this file covers the other two awards the share-card feature added:
 * Top Fragger (highest self-reported kills across a tournament) and
 * wager-Battle winner (just `Match.winnerId` + `Battle.stakeAmount > 0`,
 * no derivation needed — kept here only as the one place that decides
 * what counts as a "wager win" so the eligibility check can't drift
 * between the match page and the share route).
 */

import { prisma } from "@/lib/db";
import type { ResultPayload } from "@/lib/matches";

export type TopFragger = { userId: string; totalKills: number };

/**
 * Sums each player's own self-reported `kills` (see `ResultPayload`)
 * across every COMPLETE match in a tournament. Self-reported, same trust
 * model as `score` — this is flavor data for a share card, not money.
 * Returns null when nobody in the tournament ever entered a kill count,
 * rather than crowning a fabricated 0-kill "winner".
 */
export async function computeTopFragger(tournamentId: string): Promise<TopFragger | null> {
  const matches = await prisma.match.findMany({
    where: { tournamentId, status: "COMPLETE" },
    select: { playerAId: true, playerBId: true, resultA: true, resultB: true },
  });

  const totals = new Map<string, number>();
  for (const match of matches) {
    const resultA = match.resultA as unknown as ResultPayload | null;
    const resultB = match.resultB as unknown as ResultPayload | null;
    if (resultA?.kills != null) totals.set(match.playerAId, (totals.get(match.playerAId) ?? 0) + resultA.kills);
    if (resultB?.kills != null) totals.set(match.playerBId, (totals.get(match.playerBId) ?? 0) + resultB.kills);
  }

  let best: TopFragger | null = null;
  for (const [userId, totalKills] of totals) {
    if (!best || totalKills > best.totalKills) best = { userId, totalKills };
  }
  return best;
}

/** A "wager win": a completed Battle match with a real stake on it, from
 *  the winner's side. Free Battles and tournament matches don't qualify —
 *  there's no pot to have won. */
export function isWagerBattleWin(match: {
  winnerId: string | null;
  status: string;
  battle: { stakeAmount: number } | null;
}): boolean {
  return match.status === "COMPLETE" && match.winnerId !== null && (match.battle?.stakeAmount ?? 0) > 0;
}
