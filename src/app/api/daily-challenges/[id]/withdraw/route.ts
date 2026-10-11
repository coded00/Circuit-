/** Circuit — leave a Daily Challenge before its match window starts. The fee goes straight back to the wallet. */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { withdrawEntry } from "@/lib/dailyChallengeEntries";
import { challengeErrorResponse } from "@/lib/dailyChallengeHttp";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;

  try {
    const { refunded } = await withdrawEntry({ userId: user.id, challengeId: id });
    return NextResponse.json({ ok: true, refunded });
  } catch (err) {
    return challengeErrorResponse(err);
  }
}
