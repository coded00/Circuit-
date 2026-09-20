/**
 * Circuit Community — channel messages. GET is the polling endpoint the
 * client re-fetches on an interval (see `Poller.tsx`'s own comment on
 * why polling, not a WebSocket, for why nothing fancier is happening
 * here); POST sends a new one.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getChannelMessages, getChannelMessagesSince, sendMessage, CommunityError } from "@/lib/community";

const STATUS_BY_CODE: Record<CommunityError["code"], number> = {
  NOT_FOUND: 404,
  DISABLED: 409,
  FORBIDDEN: 403,
  NOT_A_MEMBER: 403,
  ALREADY_MEMBER: 409,
  EMPTY_MESSAGE: 400,
  MESSAGE_TOO_LONG: 400,
};

export async function GET(request: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { channelId } = await params;
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const since = searchParams.get("since"); // ISO timestamp — "only what's new" for the polling path

  if (since) {
    const messages = await getChannelMessagesSince(channelId, new Date(since));
    return NextResponse.json({ messages });
  }

  const page = await getChannelMessages(channelId, cursor);
  return NextResponse.json(page);
}

export async function POST(request: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { channelId } = await params;
  const body = await request.json().catch(() => null);
  if (typeof body?.content !== "string") {
    return NextResponse.json({ error: "Message content is required." }, { status: 400 });
  }

  try {
    const message = await sendMessage(channelId, user.id, body.content);
    return NextResponse.json(message, { status: 201 });
  } catch (err) {
    if (err instanceof CommunityError) return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] });
    throw err;
  }
}
