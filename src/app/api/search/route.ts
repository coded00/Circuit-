/**
 * Circuit — cross-entity search (tournaments, Battles, players). No
 * schema change, no auth guard — every entity here is already a publicly
 * readable page. `contains`/insensitive does a sequential scan at V1's
 * data volume, same accepted-gap class as the registration-cap race
 * elsewhere in this codebase — a pg_trgm/GIN index is a named follow-up,
 * not built speculatively here.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const RESULTS_PER_CATEGORY = 5;
const MIN_QUERY_LENGTH = 2;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ tournaments: [], battles: [], users: [] });
  }

  const [tournaments, battles, users] = await Promise.all([
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
        OR: [{ displayName: { contains: q, mode: "insensitive" } }, { handle: { contains: q, mode: "insensitive" } }],
      },
      take: RESULTS_PER_CATEGORY,
      select: { id: true, displayName: true, handle: true, avatarUrl: true },
    }),
  ]);

  return NextResponse.json({ tournaments, battles, users });
}
