/**
 * Circuit — answer a lobby results flag. Body: { action, note? }:
 * "resolve" / "dismiss" (organizer while open, staff once escalated) or
 * "escalate" (the player who raised it). See src/lib/lobby.ts.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { answerFlag, LobbyError } from "@/lib/lobby";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  try {
    await answerFlag({ flagId: id, actor: user, action: body?.action, note: body?.note });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof LobbyError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
