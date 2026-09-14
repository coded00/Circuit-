/**
 * Circuit — accept a Battle (Build Plan P4-4, maps: BTL-4).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { createBattleMatch } from "@/lib/matches";
import { notify } from "@/lib/notifications";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to accept a Battle." }, { status: 401 });
  }
  if (user.isSuspended) {
    return NextResponse.json(
      { error: `Your account is suspended: ${user.suspensionReason ?? "contact support."}` },
      { status: 403 }
    );
  }

  const { id } = await params;
  const battle = await prisma.battle.findUnique({ where: { id } });
  if (!battle) {
    return NextResponse.json({ error: "Battle not found." }, { status: 404 });
  }
  if (battle.status !== "OPEN") {
    return NextResponse.json({ error: "This Battle isn't open anymore." }, { status: 409 });
  }
  if (battle.creatorId === user.id) {
    return NextResponse.json({ error: "You can't accept your own Battle." }, { status: 403 });
  }
  if (battle.visibility === "TARGETED" && battle.targetUserId !== user.id) {
    return NextResponse.json({ error: "This Battle was targeted at someone else." }, { status: 403 });
  }

  // Two players clicking Accept on the same open Battle around the same
  // moment is a real scenario on a shared board, not a hypothetical — a
  // plain update() after the checks above would let both through. This
  // conditional update is the atomic compare-and-swap: only the request
  // that actually flips OPEN → ACCEPTED gets to create the Match.
  const claimed = await prisma.battle.updateMany({
    where: { id: battle.id, status: "OPEN" },
    data: { status: "ACCEPTED" },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "This Battle isn't open anymore." }, { status: 409 });
  }

  try {
    const match = await createBattleMatch(battle, user.id);
    await Promise.all([
      notify(battle.creatorId, "BATTLE_ACCEPTED", { battleId: battle.id }),
      notify(battle.creatorId, "MATCH_READY", { matchId: match.id }),
      notify(user.id, "MATCH_READY", { matchId: match.id }),
    ]);
    return NextResponse.json({ matchId: match.id }, { status: 201 });
  } catch (err) {
    // Don't leave the Battle stuck ACCEPTED with no Match behind it.
    await prisma.battle.update({ where: { id: battle.id }, data: { status: "OPEN" } });
    throw err;
  }
}
