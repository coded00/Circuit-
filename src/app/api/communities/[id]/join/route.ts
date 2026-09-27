/**
 * Circuit Community — join ({ acceptRules } when the community has rules)
 * and leave. APPLY communities go through /applications, INVITE ones
 * through /api/invites/[code].
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { communityErrorResponse, jsonBody } from "@/lib/communityHttp";
import { joinCommunity, leaveCommunity, CommunityError } from "@/lib/community";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { id } = await params;
  const body = await jsonBody(request);
  try {
    await joinCommunity(id, user.id, { acceptRules: body.acceptRules === true });
    return NextResponse.json({ joined: true }, { status: 201 });
  } catch (err) {
    if (err instanceof CommunityError) return communityErrorResponse(err, { NOT_A_MEMBER: 404 });
    throw err;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { id } = await params;
  try {
    await leaveCommunity(id, user.id);
    return NextResponse.json({ joined: false });
  } catch (err) {
    if (err instanceof CommunityError) return communityErrorResponse(err, { NOT_A_MEMBER: 404 });
    throw err;
  }
}
