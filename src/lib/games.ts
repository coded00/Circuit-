/**
 * Circuit — real-game lookup for the public /games/[slug] pages.
 *
 * Deliberately NOT sourced from the `Game` model (Admin > Games) — that
 * catalog is what creation/edit forms offer as options, and in practice
 * it's full of dev/QA fixtures ("Stream Test Game", "Cancel Test",
 * "Suspend Test", ...) that were never real games anyone competed in.
 * A public SEO page for "Cancel Test" would be exactly the kind of thin,
 * fake content the SEO brief explicitly warns against. Instead, this
 * derives the real, ever-used game list straight from Tournament/Battle
 * rows — a game only gets a public page if someone actually ran a real
 * tournament or Challenge for it.
 */

import { prisma } from "@/lib/db";
import { slugify } from "@/lib/seo";

export async function realGameNames(): Promise<string[]> {
  const [tournamentGames, battleGames] = await Promise.all([
    prisma.tournament.groupBy({ by: ["game"] }),
    prisma.battle.groupBy({ by: ["game"] }),
  ]);
  const names = new Set<string>([...tournamentGames.map((r) => r.game), ...battleGames.map((r) => r.game)]);
  return [...names];
}

/** Returns the real, canonical game name (matching casing/spelling as
 *  actually stored) for a given URL slug, or null if no real tournament/
 *  Battle has ever used that game — the page should 404, not render thin. */
export async function findGameBySlug(slug: string): Promise<string | null> {
  const names = await realGameNames();
  return names.find((name) => slugify(name) === slug) ?? null;
}
