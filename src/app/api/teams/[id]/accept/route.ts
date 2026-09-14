/**
 * Circuit — accept a received team invite.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const membership = await prisma.teamMembership.findUnique({
    where: { teamId_userId: { teamId: id, userId: user.id } },
  });
  if (!membership) {
    return NextResponse.json({ error: "No invite found." }, { status: 404 });
  }
  if (membership.accepted) {
    return NextResponse.json({ error: "Already accepted." }, { status: 409 });
  }

  await prisma.teamMembership.update({ where: { id: membership.id }, data: { accepted: true } });
  return NextResponse.json({ ok: true });
}
