/**
 * Circuit — create a Daily Challenge draft. Staff only. A draft can be saved while the platform switch is off,
 * so a challenge can be prepared in advance; publishing is what the switch gates.
 */

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/session";
import { readJsonObject } from "@/lib/adminRoute";
import { createDraft } from "@/lib/dailyChallengeAdmin";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;

  const result = await createDraft(body, auth.user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
