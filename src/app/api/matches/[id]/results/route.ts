/**
 * Circuit — result submission (Build Plan P3-4, maps: BRK-3).
 *
 * BRK-3's acceptance criteria ("rejected... if no match code is visible in
 * it") isn't OCR-checked here — the PRD frames automated proof screening
 * as backlog, not V1 scope (see src/lib/matches.ts's submitResult doc).
 * `proofShowsMatchCode` is a submitter attestation; the real check is a
 * human — organizer or staff — during dispute review, if it comes to that.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { MatchError, submitResult } from "@/lib/matches";

const MAX_PROOF_BYTES = 10 * 1024 * 1024;

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
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid form submission." }, { status: 400 });
  }

  const winnerId = form.get("winnerId");
  const score = form.get("score");
  const proofConfirmed = form.get("proofShowsMatchCode");
  const proofFile = form.get("proof");

  if (typeof winnerId !== "string" || !winnerId) {
    return NextResponse.json({ error: "Winner is required." }, { status: 400 });
  }
  if (typeof score !== "string" || !score.trim()) {
    return NextResponse.json({ error: "Score is required." }, { status: 400 });
  }
  if (proofConfirmed !== "true") {
    return NextResponse.json(
      { error: "You must confirm the match code is visible in your proof." },
      { status: 400 }
    );
  }
  if (!(proofFile instanceof File) || proofFile.size === 0) {
    return NextResponse.json({ error: "A proof screenshot or clip is required." }, { status: 400 });
  }
  if (proofFile.size > MAX_PROOF_BYTES) {
    return NextResponse.json({ error: "Proof file is too large (10MB max)." }, { status: 400 });
  }

  const proofBuffer = Buffer.from(await proofFile.arrayBuffer());

  try {
    const result = await submitResult({
      matchId: id,
      submittingUserId: user.id,
      winnerId,
      score: score.trim(),
      proofBuffer,
      proofContentType: proofFile.type || "application/octet-stream",
    });
    return NextResponse.json({ status: result.outcome });
  } catch (err) {
    if (err instanceof MatchError) {
      return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] });
    }
    throw err;
  }
}
