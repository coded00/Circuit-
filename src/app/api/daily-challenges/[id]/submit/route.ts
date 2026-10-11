/**
 * Circuit — submit a score for a Daily Challenge: the number, the scoreboard screenshot (and a recording where the
 * challenge asks for one), and an answer for every requirement. Multipart, like a match result. The file's type comes
 * from its own bytes, never the browser's Content-Type, exactly as for match proof.
 */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { PROOF_TYPE_ERROR, sniffProofType } from "@/lib/imageSniff";
import { submitScore } from "@/lib/dailyChallengeSubmissions";
import { challengeErrorResponse } from "@/lib/dailyChallengeHttp";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const { id } = await params;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form submission." }, { status: 400 });

  const evidenceFile = form.get("evidence");
  if (!(evidenceFile instanceof File) || evidenceFile.size === 0) {
    return NextResponse.json({ error: "Upload a screenshot of the match-end scoreboard." }, { status: 400 });
  }
  if (evidenceFile.size > MAX_FILE_BYTES) return NextResponse.json({ error: "The screenshot is too large (10MB max)." }, { status: 400 });
  const evidenceBuffer = Buffer.from(await evidenceFile.arrayBuffer());
  const evidenceType = sniffProofType(evidenceBuffer);
  if (!evidenceType) return NextResponse.json({ error: PROOF_TYPE_ERROR }, { status: 400 });
  // The main evidence is the scoreboard screenshot; a clip belongs in the recording slot.
  if (evidenceType.startsWith("video/")) return NextResponse.json({ error: "The scoreboard has to be a screenshot. Add a clip as the screen recording." }, { status: 400 });

  let recording: { buffer: Buffer; contentType: string } | null = null;
  const recordingFile = form.get("recording");
  if (recordingFile instanceof File && recordingFile.size > 0) {
    if (recordingFile.size > MAX_FILE_BYTES) return NextResponse.json({ error: "The recording is too large (10MB max)." }, { status: 400 });
    const buffer = Buffer.from(await recordingFile.arrayBuffer());
    const type = sniffProofType(buffer);
    if (!type) return NextResponse.json({ error: PROOF_TYPE_ERROR }, { status: 400 });
    recording = { buffer, contentType: type };
  }

  let claims: unknown = [];
  const claimsRaw = form.get("claims");
  if (typeof claimsRaw === "string" && claimsRaw.trim() !== "") {
    try {
      claims = JSON.parse(claimsRaw);
    } catch {
      return NextResponse.json({ error: "The requirement answers weren't understood. Reload and try again." }, { status: 400 });
    }
  }

  try {
    const { submissionId } = await submitScore({
      userId: user.id,
      challengeId: id,
      score: form.get("score"),
      tiebreakScore: form.get("tiebreakScore"),
      claims,
      evidence: { buffer: evidenceBuffer, contentType: evidenceType },
      recording,
    });
    return NextResponse.json({ submissionId }, { status: 201 });
  } catch (err) {
    return challengeErrorResponse(err);
  }
}
