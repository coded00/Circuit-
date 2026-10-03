/**
 * Circuit — finalise a lobby tournament's results (organizer or staff):
 * every round posted and no flag waiting. The tournament goes COMPLETE
 * and the top of the leaderboard can claim the prize.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { finaliseLobby, LobbyError } from "@/lib/lobby";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  try {
    await finaliseLobby(id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof LobbyError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
