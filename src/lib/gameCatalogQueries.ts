/**
 * Circuit — Prisma reads for the game catalog, always in admin-set order
 * (modes by sortOrder, formats by sortOrder), so every surface lists them
 * the same way the builder does.
 */

import { prisma } from "@/lib/db";

export const catalogTreeInclude = {
  modes: {
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    include: { formats: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] } },
  },
};

export function loadGameTree(id: string) {
  return prisma.game.findUnique({ where: { id }, include: catalogTreeInclude });
}

/** Lowercased game name → the image a game tile should show (cover first, then icon). */
export async function gameImageMap(): Promise<Record<string, string>> {
  const games = await prisma.game.findMany({
    where: { OR: [{ coverUrl: { not: null } }, { iconUrl: { not: null } }] },
    select: { name: true, coverUrl: true, iconUrl: true },
  });
  const map: Record<string, string> = {};
  for (const g of games) map[g.name.trim().toLowerCase()] = (g.coverUrl ?? g.iconUrl)!;
  return map;
}

/** Games players can see and pick: enabled and published in Admin → Games. */
export async function publishedGames() {
  return prisma.game.findMany({
    where: { enabled: true, publishedAt: { not: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
