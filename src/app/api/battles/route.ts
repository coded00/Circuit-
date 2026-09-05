/**
 * Circuit — Battle creation (Build Plan P4-1, maps: BTL-1, BTL-3).
 *
 * Stake field exists on the model (Battle.stakeAmount) but this route
 * never accepts one from the request — it's always the schema default
 * (0). D1/BTL-1: no V1 UI path may set it above zero.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { notify } from "@/lib/notifications";
import { parseOptionalUrl } from "@/lib/validation";

const VALID_FORMATS = ["SINGLE", "BEST_OF_3"];

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to open a Battle." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const game = typeof body?.game === "string" ? body.game.trim() : "";
  const format = typeof body?.format === "string" ? body.format : "";
  const visibility = body?.visibility === "TARGETED" ? "TARGETED" : "OPEN";
  const targetHandle =
    typeof body?.targetHandle === "string" ? body.targetHandle.trim().replace(/^@/, "") : "";

  if (!game) {
    return NextResponse.json({ error: "Game is required." }, { status: 400 });
  }
  if (!VALID_FORMATS.includes(format)) {
    return NextResponse.json({ error: "Format must be a single match or best of three." }, { status: 400 });
  }
  const streamUrlResult = parseOptionalUrl(body?.streamUrl);
  if (!streamUrlResult.ok) {
    return NextResponse.json({ error: "Stream link must be a valid http(s) URL." }, { status: 400 });
  }

  let targetUserId: string | null = null;
  if (visibility === "TARGETED") {
    if (!targetHandle) {
      return NextResponse.json(
        { error: "A targeted Battle needs the handle of who you're challenging." },
        { status: 400 }
      );
    }
    const target = await prisma.user.findUnique({ where: { handle: targetHandle } });
    if (!target) {
      return NextResponse.json({ error: `No player found with handle @${targetHandle}.` }, { status: 400 });
    }
    if (target.id === user.id) {
      return NextResponse.json({ error: "You can't challenge yourself." }, { status: 400 });
    }
    targetUserId = target.id;
  }

  const battle = await prisma.battle.create({
    data: {
      creatorId: user.id,
      game,
      format,
      visibility,
      targetUserId,
      streamUrl: streamUrlResult.url,
    },
  });

  if (targetUserId) {
    await notify(targetUserId, "BATTLE_CHALLENGE", { battleId: battle.id });
  }

  return NextResponse.json({ id: battle.id }, { status: 201 });
}
