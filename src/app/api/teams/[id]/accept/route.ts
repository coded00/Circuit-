/**
 * Circuit — accept a pending team membership row. Two real flows share
 * this one endpoint (see TeamMembership.requestedByMember's own schema
 * comment): a captain-sent invite (the invited user accepts, membership
 * keyed by their own id) or a member's request to join (the captain
 * accepts, membership keyed by the requester's id) — the permission check
 * below picks the right one.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  // Only meaningful for the join-request flow — the captain identifies
  // which pending requester they're accepting.
  const requesterId = typeof body?.userId === "string" ? body.userId : user.id;

  const membership = await prisma.teamMembership.findUnique({
    where: { teamId_userId: { teamId: id, userId: requesterId } },
  });
  if (!membership) {
    return NextResponse.json({ error: "No pending request found." }, { status: 404 });
  }
  if (membership.accepted) {
    return NextResponse.json({ error: "Already accepted." }, { status: 409 });
  }

  if (membership.requestedByMember) {
    const team = await prisma.team.findUnique({ where: { id } });
    if (!team || team.captainId !== user.id) {
      return NextResponse.json({ error: "Only the captain can accept a join request." }, { status: 403 });
    }
  } else if (membership.userId !== user.id) {
    return NextResponse.json({ error: "Only the invited player can accept this invite." }, { status: 403 });
  }

  await prisma.teamMembership.update({ where: { id: membership.id }, data: { accepted: true } });
  return NextResponse.json({ ok: true });
}
