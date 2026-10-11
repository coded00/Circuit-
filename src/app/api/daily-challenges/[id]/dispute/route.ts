/** Circuit — dispute the decision on your own submission while a Daily Challenge's results are provisional. */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { readJsonObject } from "@/lib/adminRoute";
import { raiseDispute } from "@/lib/challengeDisputes";
import { challengeErrorResponse } from "@/lib/dailyChallengeHttp";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const { id } = await params;

  try {
    const { disputeId } = await raiseDispute({ userId: user.id, challengeId: id, reason: body.reason });
    return NextResponse.json({ disputeId }, { status: 201 });
  } catch (err) {
    return challengeErrorResponse(err);
  }
}
