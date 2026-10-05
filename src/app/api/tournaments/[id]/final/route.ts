/**
 * Circuit — end a grouped lobby tournament's group stage and start the
 * final (organizer or staff): the top of each group qualify, and the
 * final's rounds are created. See startFinal in src/lib/lobby.ts.
 */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { LobbyError, startFinal } from "@/lib/lobby";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const { id } = await params;
  try {
    await startFinal(id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof LobbyError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
