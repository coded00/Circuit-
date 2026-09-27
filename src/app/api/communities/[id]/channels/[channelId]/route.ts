/** Circuit — edit a channel: PATCH { name?, modOnly?, move?: "up" | "down" }; DELETE removes it. */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { deleteChannel, updateChannel } from "@/lib/communityModeration";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

type Params = { params: Promise<{ channelId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { channelId } = await params;
  try {
    await updateChannel(channelId, user, await jsonBody(request));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleCommunityError(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { channelId } = await params;
  try {
    await deleteChannel(channelId, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleCommunityError(err);
  }
}
