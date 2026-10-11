/**
 * Circuit — serves a submission's screenshot or recording. Only the player who submitted it and staff may read it;
 * the storage reference never leaves the server (same rule as match proof, and served through the same hardened
 * response — sandboxed, no sniffing, never inline HTML).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { proofStorage } from "@/lib/storage";
import { proofResponse } from "@/lib/proofResponse";

export async function GET(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { submissionId } = await params;

  const submission = await prisma.dailyChallengeSubmission.findUnique({
    where: { id: submissionId },
    select: { evidenceRef: true, recordingRef: true, entry: { select: { userId: true } } },
  });
  if (!submission) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!user.isStaff && submission.entry.userId !== user.id) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const wantsRecording = new URL(request.url).searchParams.get("file") === "recording";
  const ref = wantsRecording ? submission.recordingRef : submission.evidenceRef;
  if (!ref) return NextResponse.json({ error: "No such file." }, { status: 404 });

  const { buffer, contentType } = await proofStorage.read(ref);
  return proofResponse(buffer, contentType);
}
