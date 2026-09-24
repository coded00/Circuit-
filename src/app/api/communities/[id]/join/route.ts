/**
 * Circuit Community — join/leave. Posting or reading channel messages
 * requires membership (see `sendMessage`'s own check) — this is the one
 * write that creates it.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { joinCommunity, leaveCommunity, CommunityError } from "@/lib/community";

const STATUS_BY_CODE: Record<CommunityError["code"], number> = {
  NOT_FOUND: 404,
  DISABLED: 409,
  FORBIDDEN: 403,
  NOT_A_MEMBER: 404,
  ALREADY_MEMBER: 409,
  EMPTY_MESSAGE: 400,
  MESSAGE_TOO_LONG: 400,
  INVALID_STICKER: 400,
  INVALID_IMAGE: 400,
  IMAGE_TOO_LARGE: 413,
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { id } = await params;
  try {
    await joinCommunity(id, user.id);
    return NextResponse.json({ joined: true }, { status: 201 });
  } catch (err) {
    if (err instanceof CommunityError) return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] });
    throw err;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { id } = await params;
  try {
    await leaveCommunity(id, user.id);
    return NextResponse.json({ joined: false });
  } catch (err) {
    if (err instanceof CommunityError) return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] });
    throw err;
  }
}
