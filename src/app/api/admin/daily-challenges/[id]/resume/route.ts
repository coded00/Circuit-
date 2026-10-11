/** Circuit — resume a paused Daily Challenge. Deadlines still ahead move later by as long as the pause lasted. Staff only. */

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/session";
import { resumeChallenge } from "@/lib/dailyChallengeAdmin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const { id } = await params;

  const result = await resumeChallenge(id, auth.user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, shiftedMinutes: result.shiftedMinutes });
}
