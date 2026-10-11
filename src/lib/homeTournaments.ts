/**
 * Circuit — which tournaments the homepage's two rows show. They never
 * overlap, because each takes a different slice of the lifecycle:
 *
 * - Featured: what you can act on right now. LIVE first, then registration
 *   OPEN (biggest prize first, then soonest start).
 * - Upcoming: on the calendar but not open to enter yet. DRAFT means
 *   "announced, hasn't reached its own registrationOpenAt yet" (a tournament
 *   set for next week should read as upcoming today); CLOSED is registration
 *   over with the start still ahead. Soonest start first. The tournament page
 *   gates Register on the real date regardless of status, so listing a DRAFT
 *   can't let anyone register early.
 */

import { prisma } from "@/lib/db";

export const cardSelect = {
  id: true,
  name: true,
  game: true,
  status: true,
  format: true,
  teamSize: true,
  entryFee: true,
  participantCap: true,
  streamUrl: true,
  registrationOpenAt: true,
  posterUrl: true,
  startAt: true,
  prizeAmount: true,
  prizeText: true,
  _count: { select: { registrations: { where: { status: "CONFIRMED" as const } } } },
} as const;

/**
 * Featured = what you can act on right now: tournaments that are LIVE first,
 * then the ones with registration OPEN (biggest prize first, then soonest
 * start). Announced tournaments that haven't opened yet are not here; they
 * belong to Upcoming below, so the two rows never show the same tournament.
 */
export async function getFeaturedTournaments(limit: number) {
  const [live, open] = await Promise.all([
    prisma.tournament.findMany({ where: { status: "LIVE" }, orderBy: { startAt: "desc" }, take: limit, select: cardSelect }),
    prisma.tournament.findMany({
      where: { status: "OPEN" },
      orderBy: [{ prizeAmount: { sort: "desc", nulls: "last" } }, { startAt: "asc" }],
      take: limit,
      select: cardSelect,
    }),
  ]);
  return [...live, ...open].slice(0, limit);
}

export async function getUpcomingTournaments(limit: number) {
  return prisma.tournament.findMany({ where: { status: { in: ["DRAFT", "CLOSED"] } }, orderBy: { startAt: "asc" }, take: limit, select: cardSelect });
}
