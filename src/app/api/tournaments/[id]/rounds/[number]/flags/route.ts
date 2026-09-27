/**
 * Circuit — a player flags a posted lobby round. Body: { reason }.
 * See src/lib/lobby.ts for the organizer → staff flow.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { LobbyError, raiseFlag } from "@/lib/lobby";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; number: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (user.isSuspended) return NextResponse.json({ error: "Your account is suspended." }, { status: 403 });
  const { id, number } = await params;
  const body = await request.json().catch(() => null);
  try {
    await raiseFlag({ tournamentId: id, roundNumber: Number(number), user, reason: body?.reason });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof LobbyError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
