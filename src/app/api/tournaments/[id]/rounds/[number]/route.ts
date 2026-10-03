/**
 * Circuit — enter or correct one lobby round's results (organizer or
 * staff). Body: { results: [{ registrationId, placement, kills }], proofUrl? }.
 * See src/lib/lobby.ts.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { LobbyError, saveRoundResults } from "@/lib/lobby";
import { parseOptionalImageUrl } from "@/lib/validation";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; number: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id, number } = await params;
  const body = await request.json().catch(() => null);
  const proof = parseOptionalImageUrl(body?.proofUrl);
  if (!proof.ok) return NextResponse.json({ error: "The screenshot link isn't valid." }, { status: 400 });
  try {
    await saveRoundResults({ tournamentId: id, roundNumber: Number(number), actor: user, results: body?.results, proofUrl: proof.url });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof LobbyError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
