/** Circuit — a captain adds their team to a community: POST { teamId }. */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { addTeamToCommunity } from "@/lib/communityModeration";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const { id } = await params;
  const body = await jsonBody(request);
  if (typeof body.teamId !== "string") return NextResponse.json({ error: "Pick a team." }, { status: 400 });
  try {
    await addTeamToCommunity(id, user, body.teamId);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return handleCommunityError(err);
  }
}
