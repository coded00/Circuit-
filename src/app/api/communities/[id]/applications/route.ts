/** Circuit — apply to an APPLY community: POST { answer, acceptRules }. */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { applyToCommunity } from "@/lib/communityModeration";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { id } = await params;
  const key = `community-apply:${user.id}`;
  if ((await isRateLimited(key, { max: 20, windowMs: 60 * 60 * 1000 })).limited) {
    return NextResponse.json({ error: "Too many applications — try again later." }, { status: 429 });
  }
  try {
    await applyToCommunity(id, user.id, await jsonBody(request));
    await recordAttempt(key);
    return NextResponse.json({ applied: true }, { status: 201 });
  } catch (err) {
    return handleCommunityError(err);
  }
}
