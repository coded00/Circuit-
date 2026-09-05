/**
 * Circuit — cancel an open Battle (Build Plan P4-6, maps: BTL-6).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const battle = await prisma.battle.findUnique({ where: { id } });
  if (!battle) {
    return NextResponse.json({ error: "Battle not found." }, { status: 404 });
  }
  if (battle.creatorId !== user.id) {
    return NextResponse.json({ error: "Only the Battle's creator can cancel it." }, { status: 403 });
  }

  const cancelled = await prisma.battle.updateMany({
    where: { id: battle.id, status: "OPEN" },
    data: { status: "CANCELLED" },
  });
  if (cancelled.count === 0) {
    return NextResponse.json(
      { error: "This Battle has already been accepted or cancelled." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
