/**
 * Circuit — confirm the opponent's reported result. The second player
 * agrees with what the first reported; to disagree they report their own
 * result (with proof) through /results instead. See confirmResult in
 * src/lib/matches.ts.
 */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { confirmResult, MatchError } from "@/lib/matches";

const STATUS_BY_CODE: Partial<Record<MatchError["code"], number>> = {
  NOT_FOUND: 404,
  NOT_A_PARTICIPANT: 403,
  ALREADY_COMPLETE: 409,
  ALREADY_RESOLVED: 409,
  DISPUTED: 409,
  NOTHING_TO_CONFIRM: 409,
  TOURNAMENT_CANCELLED: 409,
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const { id } = await params;
  try {
    const result = await confirmResult({ matchId: id, confirmingUserId: user.id });
    return NextResponse.json({ status: result.outcome });
  } catch (err) {
    if (err instanceof MatchError) return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] ?? 400 });
    throw err;
  }
}
