/** Circuit — lift a community ban (moderators). */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { unban } from "@/lib/communityModeration";
import { handleCommunityError } from "@/lib/communityHttp";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const { id, userId } = await params;
  try {
    await unban(id, user, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleCommunityError(err);
  }
}
