/**
 * Circuit — leave a team, decline an invite, or (captain only) remove
 * someone else. Same delete-the-row action either way. The captain
 * can't remove themselves through this route — see `Team`'s own schema
 * comment on why disbanding is the only way a captain leaves.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id, userId: targetUserId } = await params;
  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });

  if (targetUserId === team.captainId) {
    return NextResponse.json({ error: "The captain must disband the team instead of leaving." }, { status: 400 });
  }
  if (user.id !== targetUserId && user.id !== team.captainId) {
    return NextResponse.json({ error: "Only you or the captain can do that." }, { status: 403 });
  }

  const membership = await prisma.teamMembership.findUnique({
    where: { teamId_userId: { teamId: id, userId: targetUserId } },
  });
  if (!membership) return NextResponse.json({ error: "Not on this team." }, { status: 404 });

  await prisma.teamMembership.delete({ where: { id: membership.id } });
  return NextResponse.json({ ok: true });
}
