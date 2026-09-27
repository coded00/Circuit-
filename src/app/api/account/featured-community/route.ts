/** Circuit — which community tag you wear: PUT { communityId | null }. */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setFeaturedCommunity } from "@/lib/communityModeration";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const body = await jsonBody(request);
  const communityId = typeof body.communityId === "string" ? body.communityId : null;
  try {
    await setFeaturedCommunity(user.id, communityId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleCommunityError(err);
  }
}
