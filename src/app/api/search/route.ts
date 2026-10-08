/**
 * Circuit — cross-entity search (tournaments, Battles, players, games,
 * communities). Games are the ones with a public page (a tournament or
 * Challenge has used them); communities are enabled, not suspended and
 * not invite-only (those are unlisted). Every entity here is already a
 * publicly readable page, so there is no auth guard.
 *
 * Unauthenticated and expensive, so it is throttled per caller (finding #11 of the security audit) — see
 * PUBLIC_LIMITS in src/lib/rateLimit.ts for the numbers and why they are loose.
 *
 * The `contains`/insensitive predicates below compile to `ILIKE '%q%'`, which no btree index can serve: each
 * of the four is a sequential scan plus a per-row lower(). They are served by GIN trigram indexes instead
 * (the `ops: raw("gin_trgm_ops")` declarations on Tournament/Battle/User/Community in schema.prisma), so
 * the scans this route used to do are the reason the rate limit and the index arrived together.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { reachableUsersWhere } from "@/lib/privacy";
import { realGameNames } from "@/lib/games";
import { slugify } from "@/lib/seo";
import { throttlePublicRequest } from "@/lib/rateLimit";

const RESULTS_PER_CATEGORY = 5;
const MIN_QUERY_LENGTH = 2;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  // Answered before the throttle and not counted against it: this path touches nothing, so charging a shared
  // carrier address for it would take a whole network's search down over keystrokes that cannot return
  // results. The same rule as a malformed signup payload, and for the same reason.
  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ tournaments: [], battles: [], users: [], games: [], communities: [] });
  }

  const throttled = await throttlePublicRequest("search", request);
  if (throttled.limited) {
    return NextResponse.json(
      { error: "Too many searches. Please try again in a moment." },
      { status: 429, headers: { "Retry-After": String(throttled.retryAfterSeconds) } }
    );
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
