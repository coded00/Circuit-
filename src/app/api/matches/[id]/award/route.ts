/**
 * Circuit — a league organizer settles a fixture nobody played by its
 * matchday deadline: a win for one side, or a draw where the league allows
 * them. Body: { outcome: <winner's user id> | "DRAW", score?: "3-0" }.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { awardLeagueResult, MatchError } from "@/lib/matches";

const STATUS_BY_CODE: Record<MatchError["code"], number> = {
  NOT_FOUND: 404,
  ALREADY_COMPLETE: 409,
  DISPUTED: 409,
  NOT_A_PARTICIPANT: 403,
  INVALID_WINNER: 400,
  ALREADY_RESOLVED: 409,
  NOT_ESCALATED: 409,
  NOT_ORGANIZER_REVIEW: 409,
  FORBIDDEN: 403,
  WINDOW_EXPIRED: 409,
  VOID_UNSUPPORTED: 409,
  TOURNAMENT_CANCELLED: 409,
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const outcome = typeof body?.outcome === "string" ? body.outcome : "";
  if (!outcome) return NextResponse.json({ error: "Choose who won, or a draw." }, { status: 400 });
  const score = typeof body?.score === "string" ? body.score : undefined;
  if (score !== undefined && score.trim() && !/^\d{1,3}\s*[-–:x]\s*\d{1,3}$/i.test(score.trim())) {
    return NextResponse.json({ error: "Score should look like 3-0." }, { status: 400 });
  }

  try {
    const match = await awardLeagueResult({ matchId: id, organizerId: user.id, outcome, score });
    return NextResponse.json({ status: match.status });
  } catch (err) {
    if (err instanceof MatchError) return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] });
    throw err;
  }
}
