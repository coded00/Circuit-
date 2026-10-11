/** Circuit — add a channel (moderators): POST { name, modOnly? }. */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { createChannel } from "@/lib/communityModeration";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const { id } = await params;
  try {
    const channel = await createChannel(id, user, await jsonBody(request));
    return NextResponse.json({ id: channel.id, name: channel.name }, { status: 201 });
  } catch (err) {
    return handleCommunityError(err);
  }
}
