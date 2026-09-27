/**
 * Circuit — manage one member. PATCH { role: "MODERATOR" | "MEMBER" },
 * { transferOwnership: true }, { muteHours: 1 | 24 | 168, reason? } or
 * { unmute: true }; DELETE { ban?, reason? } removes them.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { muteMember, removeMember, setMemberRole, transferOwnership, unmuteMember } from "@/lib/communityModeration";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

type Params = { params: Promise<{ id: string; userId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { id, userId } = await params;
  const body = await jsonBody(request);
  try {
    if (body.transferOwnership === true) await transferOwnership(id, user, userId);
    else if (typeof body.muteHours === "number") await muteMember(id, user, userId, body.muteHours, typeof body.reason === "string" ? body.reason : undefined);
    else if (body.unmute === true) await unmuteMember(id, user, userId);
    else if (body.role === "MODERATOR" || body.role === "MEMBER") await setMemberRole(id, user, userId, body.role);
    else return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleCommunityError(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { id, userId } = await params;
  const body = await jsonBody(request);
  try {
    await removeMember(id, user, userId, { ban: body.ban === true, reason: typeof body.reason === "string" ? body.reason : undefined });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleCommunityError(err);
  }
}
