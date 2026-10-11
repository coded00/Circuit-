/** Circuit — create an invite link: POST { expiresInHours?, maxUses? }. */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { createInvite } from "@/lib/communityModeration";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const { id } = await params;
  const key = `community-invite:${user.id}`;
  if ((await isRateLimited(key, { max: 30, windowMs: 60 * 60 * 1000 })).limited) {
    return NextResponse.json({ error: "Too many invite links. Try again later." }, { status: 429 });
  }
  try {
    const invite = await createInvite(id, user, await jsonBody(request));
    await recordAttempt(key);
    return NextResponse.json({ id: invite.id, code: invite.code, expiresAt: invite.expiresAt, maxUses: invite.maxUses }, { status: 201 });
  } catch (err) {
    return handleCommunityError(err);
  }
}
