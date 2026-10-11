/** Circuit — pause a running Daily Challenge for a technical problem or suspected abuse. Staff only; needs a reason. */

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/session";
import { readJsonObject } from "@/lib/adminRoute";
import { pauseChallenge } from "@/lib/dailyChallengeAdmin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const { id } = await params;

  const result = await pauseChallenge(id, body.reason, auth.user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
