/**
 * Circuit — create a player community: POST { name, slug?, description?,
 * tag?, gameId?, region?, joinPolicy?, rules?, applicationQuestion?,
 * iconUrl?, bannerUrl? }. The creator becomes its owner.
 */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { createCommunity } from "@/lib/communityDirectory";
import { communityHref } from "@/lib/community";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";

const CREATE_LIMIT = { max: 5, windowMs: 24 * 60 * 60 * 1000 };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;

  const key = `community-create:${user.id}`;
  if ((await isRateLimited(key, CREATE_LIMIT)).limited) {
    return NextResponse.json({ error: "You've created a lot of communities today. Try again tomorrow." }, { status: 429 });
  }

  try {
    const community = await createCommunity(user, await jsonBody(request));
    await recordAttempt(key);
    return NextResponse.json({ id: community.id, href: communityHref(community) }, { status: 201 });
  } catch (err) {
    return handleCommunityError(err);
  }
}
