/** Circuit — revoke an invite link (its creator or a moderator). */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { revokeInvite } from "@/lib/communityModeration";
import { handleCommunityError } from "@/lib/communityHttp";

export async function DELETE(_request: Request, { params }: { params: Promise<{ inviteId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const { inviteId } = await params;
  try {
    await revokeInvite(inviteId, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleCommunityError(err);
  }
}
