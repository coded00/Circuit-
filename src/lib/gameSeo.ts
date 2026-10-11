/**
 * Circuit — the public address and search name of each game. Tournaments and challenges store the game as plain text
 * ("CODM"); the Game catalog can give that text a proper page address ("call-of-duty-mobile"), a full name for page
 * titles ("Call of Duty: Mobile") and the other names people search for ("CODM"). A game without those set keeps the
 * address built from its name, and any older or alternate address redirects to the canonical one.
 */
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/seo";

export type GameSeo = { name: string; slug: string; seoName: string; aliases: string[] };

const TTL_MS = 60_000;
let cached: { at: number; byName: Map<string, GameSeo>; bySlug: Map<string, GameSeo> } | null = null;

async function load() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached;
  const rows = await prisma.game.findMany({ select: { name: true, slug: true, seoName: true, aliases: true } });
  const byName = new Map<string, GameSeo>();
  const bySlug = new Map<string, GameSeo>();
  for (const r of rows) {
    const info: GameSeo = { name: r.name, slug: r.slug ?? slugify(r.name), seoName: r.seoName ?? r.name, aliases: r.aliases };
    byName.set(r.name.toLowerCase(), info);
    // Alternate addresses first, so a game's own canonical address always wins a clash.
    for (const a of r.aliases) bySlug.set(slugify(a), info);
    bySlug.set(slugify(r.name), info);
  }
  for (const info of byName.values()) bySlug.set(info.slug, info);
  cached = { at: Date.now(), byName, bySlug };
  return cached;
}

/** The catalog entry for a stored game name, if there is one. */
export async function gameSeoForName(name: string): Promise<GameSeo | null> {
  return (await load()).byName.get(name.toLowerCase()) ?? null;
}

/** The catalog entry an address (canonical or alternate) belongs to, if any. */
export async function gameSeoForSlug(slug: string): Promise<GameSeo | null> {
  return (await load()).bySlug.get(slug) ?? null;
}

/** The canonical public path for a stored game name. */
export async function canonicalGamePath(name: string): Promise<string> {
  const info = await gameSeoForName(name);
  return `/games/${info?.slug ?? slugify(name)}`;
}

/** Title-ready name: "Call of Duty: Mobile (CODM)" when the catalog name is an abbreviation, otherwise the name. */
export function displayGameName(name: string, info: GameSeo | null): string {
  if (!info || info.seoName.toLowerCase() === name.toLowerCase()) return name;
  return `${info.seoName} (${name})`;
}

export const _resetGameSeoCache = () => {
  cached = null;
};
