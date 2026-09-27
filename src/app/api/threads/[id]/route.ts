/** Circuit — one thread: GET its details (and whether you can post); PATCH { locked } (moderators). */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getThread, setThreadLocked } from "@/lib/communityThreads";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { id } = await params;
  try {
    const { thread, isMod, canPost } = await getThread(id, user);
    const starter = thread.starterMessage && !thread.starterMessage.deletedAt ? thread.starterMessage : null;
    return NextResponse.json({
      id: thread.id,
      title: thread.title,
      locked: thread.locked,
      channelId: thread.channel.id,
      channelName: thread.channel.name,
      communityId: thread.channel.communityId,
      messageCount: thread.messageCount,
      isMod,
      canPost,
      starter: starter ? { content: starter.content, kind: starter.kind, createdAt: starter.createdAt, author: starter.author } : null,
    });
  } catch (err) {
    return handleCommunityError(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { id } = await params;
  const body = await jsonBody(request);
  if (typeof body.locked !== "boolean") return NextResponse.json({ error: "locked (boolean) is required." }, { status: 400 });
  try {
    await setThreadLocked(id, user, body.locked);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleCommunityError(err);
  }
}
