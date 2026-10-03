/** Circuit — take a team off a community (its captain, or a moderator). */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { removeTeamFromCommunity } from "@/lib/communityModeration";
import { handleCommunityError } from "@/lib/communityHttp";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; teamId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { id, teamId } = await params;
  try {
    await removeTeamFromCommunity(id, user, teamId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleCommunityError(err);
  }
}
