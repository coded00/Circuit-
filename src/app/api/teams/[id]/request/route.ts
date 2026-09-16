/**
 * Circuit — a player requests to join a team (found via Discovery). Same
 * pending-row mechanism as a captain-sent invite (src/app/api/teams/[id]/
 * invite/route.ts), but `requestedByMember: true` — the captain accepts
 * this one, not the requester. See TeamMembership's own schema comment.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { notify } from "@/lib/notifications";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });
  if (team.captainId === user.id) {
    return NextResponse.json({ error: "You're already the captain." }, { status: 400 });
  }

  const existing = await prisma.teamMembership.findUnique({
    where: { teamId_userId: { teamId: id, userId: user.id } },
  });
  if (existing) {
    return NextResponse.json(
      { error: existing.accepted ? "Already on the team." : "Already requested." },
      { status: 409 }
    );
  }

  const membership = await prisma.teamMembership.create({
    data: { teamId: id, userId: user.id, requestedByMember: true },
  });
  await notify(team.captainId, "TEAM_JOIN_REQUEST", { teamId: id, teamName: team.name, fromHandle: user.handle });

  return NextResponse.json({ id: membership.id }, { status: 201 });
}
