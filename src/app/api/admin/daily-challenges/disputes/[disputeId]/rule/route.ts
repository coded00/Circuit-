/** Circuit — rule on a Daily Challenge dispute: uphold it (the submission goes back to review) or dismiss it. Staff only. */

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/session";
import { readJsonObject } from "@/lib/adminRoute";
import { ruleDispute } from "@/lib/challengeDisputes";
import { challengeErrorResponse } from "@/lib/dailyChallengeHttp";

export async function POST(request: Request, { params }: { params: Promise<{ disputeId: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const { disputeId } = await params;

  if (body.outcome !== "UPHELD" && body.outcome !== "DISMISSED") return NextResponse.json({ error: "Choose uphold or dismiss." }, { status: 400 });
  try {
    const { upheld } = await ruleDispute({ disputeId, reviewerId: auth.user.id, outcome: body.outcome, ruling: body.ruling });
    return NextResponse.json({ ok: true, upheld });
  } catch (err) {
    return challengeErrorResponse(err);
  }
}
