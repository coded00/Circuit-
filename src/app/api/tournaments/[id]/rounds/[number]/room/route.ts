/**
 * Circuit — the organizer posts or clears a lobby round's custom-room
 * details. Body: { roomCode, roomPassword, allRemaining? }. Only entrants,
 * the organizer and staff ever see them (src/lib/lobby.ts).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { LobbyError, saveRoomDetails } from "@/lib/lobby";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; number: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id, number } = await params;
  const body = await request.json().catch(() => null);
  try {
    await saveRoomDetails({ tournamentId: id, roundNumber: Number(number), actor: user, roomCode: body?.roomCode, roomPassword: body?.roomPassword, allRemaining: body?.allRemaining });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof LobbyError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
