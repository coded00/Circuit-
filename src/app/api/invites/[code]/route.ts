/** Circuit — join through an invite link: POST { acceptRules }. */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { communityHref } from "@/lib/community";
import { redeemInvite } from "@/lib/communityModeration";
import { INVITE_CODE_PATTERN } from "@/lib/communityRules";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const { code } = await params;
  if (!INVITE_CODE_PATTERN.test(code)) return NextResponse.json({ error: "This invite link doesn't exist." }, { status: 404 });
  const body = await jsonBody(request);
  try {
    const community = await redeemInvite(code, user.id, body.acceptRules === true);
    return NextResponse.json({ href: communityHref(community) });
  } catch (err) {
    return handleCommunityError(err);
  }
}
