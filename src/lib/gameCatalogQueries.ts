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
export type GameImages = { cover: Record<string, string>; icon: Record<string, string> };

/** Each game's two uploads, by lower-cased name. Wide spots (banners, cards) want the cover and fall back to the icon; small thumbnails want the icon and fall back to the cover. */
export async function gameImageMap(): Promise<GameImages> {
  const games = await prisma.game.findMany({
    where: { OR: [{ coverUrl: { not: null } }, { iconUrl: { not: null } }] },
    select: { name: true, coverUrl: true, iconUrl: true },
  });
  const cover: Record<string, string> = {};
  const icon: Record<string, string> = {};
  for (const g of games) {
    const key = g.name.trim().toLowerCase();
    cover[key] = (g.coverUrl ?? g.iconUrl)!;
    icon[key] = (g.iconUrl ?? g.coverUrl)!;
  }
  return { cover, icon };
}

/** Games players can see and pick: enabled and published in Admin → Games. */
export async function publishedGames() {
  return prisma.game.findMany({
    where: { enabled: true, publishedAt: { not: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, iconUrl: true },
  });
}
