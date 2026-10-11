/**
 * Circuit — Daily Challenges as cards, for the places that list challenges alongside Battles: the Challenges board
 * and the homepage's Open challenges. One loader so both show the same thing the same way.
 */

import type { DailyChallengeStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { DailyChallengeCardData } from "@/components/DailyChallengeCard";

const ACTIVE: DailyChallengeStatus[] = ["SCHEDULED", "OPEN", "LIVE"];
/** Challenges that have been played and are being checked, or are done: where the results live. */
export const RECENT: DailyChallengeStatus[] = ["UNDER_REVIEW", "PROVISIONAL", "FINALIZED", "SETTLING", "COMPLETED"];

/** Daily challenges a player can still enter or play (drafts never appear), optionally for one game, newest window first. */
export async function loadDailyChallengeCards(opts: { userId?: string | null; game?: string | null; limit?: number; statuses?: DailyChallengeStatus[] } = {}): Promise<{ cards: DailyChallengeCardData[]; total: number }> {
  const recent = !!opts.statuses && opts.statuses === RECENT;
  const where = { status: { in: opts.statuses ?? ACTIVE }, ...(opts.game ? { gameName: { equals: opts.game, mode: "insensitive" as const } } : {}) };
  const [total, rows] = await Promise.all([
    prisma.dailyChallenge.count({ where }),
    prisma.dailyChallenge.findMany({
      where,
      // What can still be entered or played comes soonest-first; results come newest-first.
      orderBy: { windowStartsAt: recent ? ("desc" as const) : ("asc" as const) },
      take: opts.limit ?? 24,
      include: {
        sponsorship: { select: { amountKobo: true } },
        prizeCategories: { select: { amountKobo: true } },
        _count: { select: { entries: { where: { status: { notIn: ["WITHDRAWN", "REFUNDED"] } } } } },
        ...(opts.userId ? { entries: { where: { userId: opts.userId, status: { notIn: ["WITHDRAWN", "REFUNDED"] } }, select: { id: true } } } : {}),
      },
    }),
  ]);

  const cards = rows.map((c): DailyChallengeCardData => ({
    id: c.id,
    title: c.title,
    gameName: c.gameName,
    status: c.status,
    pausedAt: c.pausedAt,
    entryFee: c.entryFee,
    platformFeeBps: c.platformFeeBps,
    minEntrants: c.minEntrants,
    maxEntrants: c.maxEntrants,
    entryOpensAt: c.entryOpensAt,
    entryClosesAt: c.entryClosesAt,
    windowStartsAt: c.windowStartsAt,
    windowEndsAt: c.windowEndsAt,
    submissionsCloseAt: c.submissionsCloseAt,
    entered: c._count.entries,
    sponsorKobo: c.sponsorship?.amountKobo ?? 0,
    kind: c.kind,
    weaponLabel: c.weaponLabel,
    metricLabel: c.metricLabel,
    direction: c.direction,
    requireRecording: c.requireRecording || c.kind === "WEAPON" || c.scoreNeedsRecording,
    categoryPrizeTotal: c.prizeCategories.length > 0 ? c.prizeCategories.reduce((sum, p) => sum + p.amountKobo, 0) : null,
    cadence: c.cadence,
    mine: "entries" in c ? (c.entries as unknown[]).length > 0 : false,
  }));
  return { cards, total };
}
