/** Circuit — approve a Daily Challenge's payout when it needs a named person to (a sponsor's money, or prizes over the auto-approval limit). Staff only. */

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/session";
import { approveChallengePayout } from "@/lib/challengeSettlement";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const { id } = await params;

  const result = await approveChallengePayout({ challengeId: id, actorId: auth.user.id });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
