/**
 * Circuit — first-run onboarding (/welcome): pick games, a city and
 * interests; we join the matching official communities (game hubs, the
 * city, interest communities), save the choices on the profile, and
 * recommend player communities that fit. Everyone is already in Circuit
 * Global from signup. Skippable; finishing sets User.onboardedAt.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { communityHref } from "@/lib/community";
import { ensureGameHubs } from "@/lib/communityDirectory";

export type OnboardingChoices = { gameIds: string[]; cityId: string | null; region: string | null; interestIds: string[] };

export function parseChoices(body: Record<string, unknown>): OnboardingChoices {
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 20) : []);
  const region = typeof body.region === "string" ? body.region.trim().slice(0, 60) || null : null;
  return { gameIds: ids(body.gameIds), cityId: typeof body.cityId === "string" ? body.cityId : null, region, interestIds: ids(body.interestIds) };
}

/** Joins the chosen official communities and saves games/region. */
export async function applyChoices(userId: string, choices: OnboardingChoices) {
  // Hubs are created lazily; make sure the chosen games have one so the
  // player is joined even if nobody has opened /welcome yet.
  if (choices.gameIds.length > 0) await ensureGameHubs().catch(() => undefined);
  const [chosenGames, hubs, officials] = await Promise.all([
    // Saved by name regardless of hubs: the profile's "games I play" list.
    prisma.game.findMany({ where: { id: { in: choices.gameIds }, enabled: true, publishedAt: { not: null } }, select: { name: true } }),
    prisma.community.findMany({ where: { kind: "GAME_HUB", enabled: true, gameId: { in: choices.gameIds } }, select: { id: true, game: { select: { name: true } } } }),
    prisma.community.findMany({
      where: { kind: "OFFICIAL", enabled: true, id: { in: [...choices.interestIds, ...(choices.cityId ? [choices.cityId] : [])] } },
      select: { id: true, category: true, region: true },
    }),
  ]);
  const targets = [...hubs.map((h) => h.id), ...officials.map((o) => o.id)];
  const banned = new Set((await prisma.communityBan.findMany({ where: { userId, communityId: { in: targets } }, select: { communityId: true } })).map((b) => b.communityId));
  await prisma.communityMember.createMany({ data: targets.filter((id) => !banned.has(id)).map((communityId) => ({ communityId, userId })), skipDuplicates: true });

  const city = officials.find((o) => o.category === "LOCATION");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { favoriteGames: true, region: true } });
  await prisma.user.update({
    where: { id: userId },
    data: {
      favoriteGames: [...new Set([...(user?.favoriteGames ?? []), ...chosenGames.map((g) => g.name), ...hubs.map((h) => h.game!.name)])].slice(0, 12),
      region: choices.region ?? city?.region ?? user?.region ?? null,
    },
  });
}

export type Recommendation = { id: string; href: string; name: string; description: string | null; iconUrl: string | null; tag: string | null; memberCount: number; hasRules: boolean; joinPolicy: string };
export type RecommendationGroup = { reason: string; items: Recommendation[] };

/** "Because you play X / you're in Y" — listed player communities they haven't joined. */
export async function recommendationsFor(userId: string, choices: OnboardingChoices): Promise<RecommendationGroup[]> {
  const [games, user] = await Promise.all([
    prisma.game.findMany({ where: { id: { in: choices.gameIds } }, select: { id: true, name: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { region: true } }),
  ]);
  const region = choices.region ?? user?.region ?? null;
  const base = { enabled: true, kind: "PLAYER" as const, joinPolicy: { in: ["OPEN" as const, "APPLY" as const] }, members: { none: { userId } } };
  const select = { id: true, kind: true, slug: true, tournamentId: true, name: true, description: true, iconUrl: true, tag: true, rules: true, joinPolicy: true, _count: { select: { members: true } } } as const;
  const toItem = (c: Prisma.CommunityGetPayload<{ select: typeof select }>): Recommendation => ({
    id: c.id,
    href: communityHref(c),
    name: c.name ?? "Community",
    description: c.description,
    iconUrl: c.iconUrl,
    tag: c.tag,
    memberCount: c._count.members,
    hasRules: !!c.rules,
    joinPolicy: c.joinPolicy,
  });

  const groups: RecommendationGroup[] = [];
  const seen = new Set<string>();
  for (const game of games) {
    const rows = await prisma.community.findMany({ where: { ...base, gameId: game.id }, orderBy: { lastActivityAt: { sort: "desc", nulls: "last" } }, take: 4, select });
    const items = rows.filter((r) => !seen.has(r.id)).map((r) => (seen.add(r.id), toItem(r)));
    if (items.length) groups.push({ reason: `Because you play ${game.name}`, items });
  }
  if (region) {
    const rows = await prisma.community.findMany({ where: { ...base, region: { contains: region, mode: "insensitive" } }, orderBy: { lastActivityAt: { sort: "desc", nulls: "last" } }, take: 4, select });
    const items = rows.filter((r) => !seen.has(r.id)).map((r) => (seen.add(r.id), toItem(r)));
    if (items.length) groups.push({ reason: `Because you're in ${region}`, items });
  }
  if (groups.length === 0) {
    const rows = await prisma.community.findMany({ where: base, orderBy: { lastActivityAt: { sort: "desc", nulls: "last" } }, take: 4, select });
    if (rows.length) groups.push({ reason: "Popular on Circuit", items: rows.map((r) => toItem(r)) });
  }
  return groups;
}
