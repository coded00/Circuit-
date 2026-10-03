/**
 * Circuit — cross-entity search (tournaments, Battles, players, games,
 * communities). Games are the ones with a public page (a tournament or
 * Challenge has used them); communities are enabled, not suspended and
 * not invite-only (those are unlisted). No
 * schema change, no auth guard — every entity here is already a publicly
 * readable page. `contains`/insensitive does a sequential scan at V1's
 * data volume, same accepted-gap class as the registration-cap race
 * elsewhere in this codebase — a pg_trgm/GIN index is a named follow-up,
 * not built speculatively here.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { reachableUsersWhere } from "@/lib/privacy";
import { realGameNames } from "@/lib/games";
import { slugify } from "@/lib/seo";

const RESULTS_PER_CATEGORY = 5;
const MIN_QUERY_LENGTH = 2;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ tournaments: [], battles: [], users: [], games: [], communities: [] });
  }

  const viewer = await getCurrentUser();
  const reachable = await reachableUsersWhere(viewer?.id ?? null, "discover");

  const [tournaments, battles, users, gameNames, communities] = await Promise.all([
    prisma.tournament.findMany({
      where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { game: { contains: q, mode: "insensitive" } }] },
      take: RESULTS_PER_CATEGORY,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, game: true, status: true },
    }),
    prisma.battle.findMany({
      where: { game: { contains: q, mode: "insensitive" } },
      take: RESULTS_PER_CATEGORY,
      orderBy: { createdAt: "desc" },
      select: { id: true, game: true, format: true, status: true },
    }),
    prisma.user.findMany({
      where: {
        AND: [reachable, { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { handle: { contains: q, mode: "insensitive" } }] }],
      },
      take: RESULTS_PER_CATEGORY,
      select: { id: true, displayName: true, handle: true, avatarUrl: true },
    }),
    realGameNames(),
    prisma.community.findMany({
      where: {
        name: { contains: q, mode: "insensitive" },
        slug: { not: null },
        enabled: true,
        suspendedAt: null,
        joinPolicy: { not: "INVITE" },
        kind: { not: "TOURNAMENT" },
      },
      take: RESULTS_PER_CATEGORY,
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
  ]);

  const needle = q.toLowerCase();
  const games = gameNames
    .filter((name) => name.toLowerCase().includes(needle))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, RESULTS_PER_CATEGORY)
    .map((name) => ({ name, slug: slugify(name) }));

  return NextResponse.json({ tournaments, battles, users, games, communities });
}
