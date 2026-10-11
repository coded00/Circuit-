/** Circuit — publish a Daily Challenge draft: it becomes SCHEDULED (or OPEN if entries are already due). Staff only. */

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/session";
import { publishChallenge } from "@/lib/dailyChallengeAdmin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const { id } = await params;

  const result = await publishChallenge(id, auth.user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, status: result.status });
}
