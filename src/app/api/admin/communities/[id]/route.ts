/** Circuit — staff suspend a community (with a reason the owner sees) or restore it: PATCH { enabled, reason? }. */

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { restoreCommunity, suspendCommunity } from "@/lib/communityModeration";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await jsonBody(request);
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "enabled (boolean) is required." }, { status: 400 });
  try {
    if (body.enabled) await restoreCommunity(id);
    else await suspendCommunity(id, typeof body.reason === "string" ? body.reason : "");
    await logAdminAction({
      actorId: auth.user.id,
      action: body.enabled ? "community.restore" : "community.suspend",
      targetType: "Community",
      targetId: id,
      metadata: typeof body.reason === "string" ? { reason: body.reason } : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleCommunityError(err);
  }
}
