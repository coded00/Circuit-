/**
 * Circuit — a reviewer's decision on one submission: approve with a verified score, reject, or disqualify, with the
 * verdict on every requirement. Staff only. The rules (every requirement answered, an approval can't stand on a
 * missed requirement, no reviewing your own entry) are in reviewSubmission.
 */

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/session";
import { readJsonObject } from "@/lib/adminRoute";
import { reviewSubmission } from "@/lib/dailyChallengeSubmissions";
import { challengeErrorResponse } from "@/lib/dailyChallengeHttp";

export async function POST(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const { submissionId } = await params;

  const decision = body.decision;
  if (decision !== "APPROVE" && decision !== "REJECT" && decision !== "DISQUALIFY") {
    return NextResponse.json({ error: "Choose approve, reject or disqualify." }, { status: 400 });
  }
  const toInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isInteger(Number(v)) ? Number(v) : null);
  const verdicts = Array.isArray(body.verdicts)
    ? body.verdicts
        .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
        .map((v) => ({
          requirementId: String(v.requirementId ?? ""),
          met: typeof v.met === "boolean" ? v.met : undefined,
          verifiedValue: toInt(v.verifiedValue) ?? undefined,
        }))
    : [];

  try {
    const result = await reviewSubmission({
      submissionId,
      reviewerId: auth.user.id,
      decision,
      verdicts,
      verifiedScore: toInt(body.verifiedScore),
      verifiedTiebreak: toInt(body.verifiedTiebreak),
      reasonCode: typeof body.reasonCode === "string" ? body.reasonCode : null,
      note: typeof body.note === "string" ? body.note : null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return challengeErrorResponse(err);
  }
}
