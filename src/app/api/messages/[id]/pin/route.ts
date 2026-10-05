/** Circuit — pin or unpin a message (moderators): POST { pinned }. */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { setPinned } from "@/lib/communityThreads";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const { id } = await params;
  const body = await jsonBody(request);
  try {
    await setPinned(id, user, body.pinned !== false);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleCommunityError(err);
  }
}
