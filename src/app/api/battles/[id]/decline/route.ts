/**
 * Circuit — the player a Challenge was sent to says no. Only for a
 * challenge targeted at them, and only while it's still OPEN. It closes the
 * challenge (the creator's stake, if any, goes back) and tells the creator.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { closeOpenBattle } from "@/lib/battles";
import { notify } from "@/lib/notifications";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { id } = await params;
  const battle = await prisma.battle.findUnique({ where: { id }, select: { id: true, creatorId: true, targetUserId: true, visibility: true, status: true, game: true } });
  if (!battle) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  if (battle.visibility !== "TARGETED" || battle.targetUserId !== user.id) {
    return NextResponse.json({ error: "Only the player this challenge was sent to can decline it." }, { status: 403 });
  }
  if (battle.status !== "OPEN") return NextResponse.json({ error: "This challenge isn't open anymore." }, { status: 409 });

  const closed = await closeOpenBattle(battle.id, "CANCELLED");
  if (!closed) return NextResponse.json({ error: "This challenge isn't open anymore." }, { status: 409 });

  await notify(battle.creatorId, "BATTLE_DECLINED", { battleId: battle.id, game: battle.game, byName: user.displayName }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
