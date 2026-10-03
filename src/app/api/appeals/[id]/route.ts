/** Circuit — staff decide an appeal: PATCH { overturn, response }. */

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { decideAppeal } from "@/lib/appeals";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await jsonBody(request);
  if (typeof body.overturn !== "boolean") return NextResponse.json({ error: "overturn (boolean) is required." }, { status: 400 });
  try {
    await decideAppeal(id, auth.user, body.overturn, typeof body.response === "string" ? body.response : "");
    await logAdminAction({ actorId: auth.user.id, action: body.overturn ? "appeal.overturn" : "appeal.uphold", targetType: "Appeal", targetId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleCommunityError(err);
  }
}
