/** Circuit — edit or delete a Daily Challenge draft. Staff only; a published challenge is neither edited nor deleted. */

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/session";
import { readJsonObject } from "@/lib/adminRoute";
import { deleteDraft, updateDraft } from "@/lib/dailyChallengeAdmin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const { id } = await params;

  const result = await updateDraft(id, body, auth.user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const { id } = await params;

  const result = await deleteDraft(id, auth.user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
