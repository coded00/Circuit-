/**
 * Circuit — "Enter Match" for a Battle challenge. Records that a real
 * participant has confirmed they're heading into the actual game (played
 * outside Circuit — there's nothing here to actually launch or observe).
 * UI-only signal: `playerAReadyAt`/`playerBReadyAt` never gate result
 * submission at the API level (see `submitResult` in src/lib/matches.ts,
 * unchanged by this route), so a stuck or skipped "enter" click can never
 * block someone from reporting a real result.
 *
 * Tournament bracket matches don't use this — they're reached through
 * registration + bracket generation, not a sudden Accept click, so there's
 * no "already ready" ceremony needed there.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { notify } from "@/lib/notifications";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const match = await prisma.match.findUnique({ where: { id } });
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }
  if (!match.battleId) {
    return NextResponse.json({ error: "This isn't a Battle match." }, { status: 400 });
  }
  if (match.status !== "UPCOMING") {
    return NextResponse.json({ error: "This match has already moved past the ready-check stage." }, { status: 409 });
  }

  const isPlayerA = match.playerAId === user.id;
  const isPlayerB = match.playerBId === user.id;
  if (!isPlayerA && !isPlayerB) {
    return NextResponse.json({ error: "Only match participants can do this." }, { status: 403 });
  }

  // Idempotent — clicking again (a retried request, a second tab) is a
  // no-op, not an error.
  const alreadyReady = isPlayerA ? match.playerAReadyAt !== null : match.playerBReadyAt !== null;
  if (alreadyReady) {
    return NextResponse.json({ ok: true });
  }

  const updated = await prisma.match.update({
    where: { id: match.id },
    data: isPlayerA ? { playerAReadyAt: new Date() } : { playerBReadyAt: new Date() },
  });

  const bothReady = updated.playerAReadyAt !== null && updated.playerBReadyAt !== null;
  if (bothReady) {
    // Only the side that was already waiting needs telling — the caller
    // already knows they just clicked this themselves.
    const otherPlayerId = isPlayerA ? match.playerBId : match.playerAId;
    await notify(otherPlayerId, "MATCH_LIVE", { matchId: match.id });
  }

  return NextResponse.json({ ok: true });
}
