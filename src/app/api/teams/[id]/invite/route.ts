/**
 * Circuit — captain invites a player by handle. Creates a pending
 * (`accepted: false`) `TeamMembership` row — see that model's comment.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { notify } from "@/lib/notifications";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });
  if (team.captainId !== user.id) {
    return NextResponse.json({ error: "Only the captain can invite members." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const handle = typeof body?.handle === "string" ? body.handle.trim() : "";
  if (!handle) {
    return NextResponse.json({ error: "A player handle is required." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { handle } });
  if (!target) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }
  if (target.id === team.captainId) {
    return NextResponse.json({ error: "They're already the captain." }, { status: 400 });
  }

  const existing = await prisma.teamMembership.findUnique({
    where: { teamId_userId: { teamId: id, userId: target.id } },
  });
  if (existing) {
    return NextResponse.json(
      { error: existing.accepted ? "Already on the team." : "Already invited." },
      { status: 409 }
    );
  }

  const membership = await prisma.teamMembership.create({ data: { teamId: id, userId: target.id } });
  await notify(target.id, "TEAM_INVITE", { teamId: id, teamName: team.name });

  return NextResponse.json({ id: membership.id }, { status: 201 });
}
