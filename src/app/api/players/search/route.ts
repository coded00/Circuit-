/**
 * Circuit — find players to add to a team. Matches handle or display name
 * (suspended accounts and the searcher are left out). Pass `teamId` and the
 * captain also learns who's already on that team or invited, so the picker
 * can show them as unavailable instead of hiding them.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import type { PlayerSearchState } from "@/lib/playerSearch";

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 8;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().replace(/^@/, "");
  const teamId = searchParams.get("teamId");
  if (q.length < MIN_QUERY_LENGTH) return NextResponse.json({ players: [] });

  const team = teamId ? await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, captainId: true } }) : null;
  if (teamId && (!team || team.captainId !== user.id)) {
    return NextResponse.json({ error: "Only the captain can search for players to add." }, { status: 403 });
  }

  const found = await prisma.user.findMany({
    where: {
      id: { not: user.id },
      isSuspended: false,
      OR: [{ handle: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }],
    },
    // Exact and prefix matches first, so typing "ghost" puts @ghost above @the_ghost_2.
    orderBy: [{ handle: "asc" }],
    take: 40,
    select: { id: true, handle: true, displayName: true, avatarUrl: true },
  });

  const lower = q.toLowerCase();
  const rank = (p: { handle: string }) => (p.handle.toLowerCase() === lower ? 0 : p.handle.toLowerCase().startsWith(lower) ? 1 : 2);
  const top = found.sort((a, b) => rank(a) - rank(b)).slice(0, MAX_RESULTS);

  const memberships = team
    ? await prisma.teamMembership.findMany({ where: { teamId: team.id, userId: { in: top.map((p) => p.id) } }, select: { userId: true, accepted: true } })
    : [];
  const byUser = new Map(memberships.map((m) => [m.userId, m.accepted]));

  return NextResponse.json({
    players: top.map((p) => ({
      ...p,
      state: (byUser.has(p.id) ? (byUser.get(p.id) ? "member" : "invited") : "available") as PlayerSearchState,
    })),
  });
}
