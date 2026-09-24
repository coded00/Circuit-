/**
 * Circuit Community — channel messages. GET is the polling endpoint the
 * client re-fetches on an interval (see `Poller.tsx`'s own comment on
 * why polling, not a WebSocket, for why nothing fancier is happening
 * here); POST sends a new one — JSON for text (`{ content }`) or a
 * sticker (`{ stickerId }`), multipart form data for an image (`image`
 * file + optional `caption`, `width`, `height`).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getChannelMessages,
  getChannelMessagesSince,
  sendMessage,
  CommunityError,
  MAX_CHAT_IMAGE_BYTES,
  type SendMessageInput,
} from "@/lib/community";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";

/** Image uploads cost real storage, so they get their own per-user cap —
 *  generous for real chat, tight enough to stop someone scripting a
 *  bucket-filling loop. Text/sticker messages aren't limited here. */
const IMAGE_RATE_LIMIT = { max: 20, windowMs: 10 * 60 * 1000 };

const STATUS_BY_CODE: Record<CommunityError["code"], number> = {
  NOT_FOUND: 404,
  DISABLED: 409,
  FORBIDDEN: 403,
  NOT_A_MEMBER: 403,
  ALREADY_MEMBER: 409,
  EMPTY_MESSAGE: 400,
  MESSAGE_TOO_LONG: 400,
  INVALID_STICKER: 400,
  INVALID_IMAGE: 400,
  IMAGE_TOO_LARGE: 413,
};

function parseDimension(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { channelId } = await params;
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const since = searchParams.get("since"); // ISO timestamp — "only what's new" for the polling path

  try {
    if (since) {
      const messages = await getChannelMessagesSince(channelId, user.id, new Date(since));
      return NextResponse.json({ messages });
    }

    const page = await getChannelMessages(channelId, user.id, cursor);
    return NextResponse.json(page);
  } catch (err) {
    if (err instanceof CommunityError) return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] });
    throw err;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { channelId } = await params;

  let input: SendMessageInput;
  if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const image = form?.get("image");
    if (!(image instanceof File) || image.size === 0) {
      return NextResponse.json({ error: "Choose an image to send." }, { status: 400 });
    }
    if (image.size > MAX_CHAT_IMAGE_BYTES) {
      return NextResponse.json({ error: "Images are limited to 8MB." }, { status: 413 });
    }

    const rateLimitKey = `chat-image:${user.id}`;
    const { limited, retryAfterSeconds } = await isRateLimited(rateLimitKey, IMAGE_RATE_LIMIT);
    if (limited) {
      return NextResponse.json(
        { error: `You're sending images too fast. Try again in ${Math.ceil(retryAfterSeconds / 60)} min.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }
    await recordAttempt(rateLimitKey);

    input = {
      kind: "IMAGE",
      image: Buffer.from(await image.arrayBuffer()),
      caption: String(form?.get("caption") ?? ""),
      width: parseDimension(form?.get("width") ?? null),
      height: parseDimension(form?.get("height") ?? null),
    };
  } else {
    const body = await request.json().catch(() => null);
    if (typeof body?.stickerId === "string") {
      input = { kind: "STICKER", stickerId: body.stickerId };
    } else if (typeof body?.content === "string") {
      input = { kind: "TEXT", content: body.content };
    } else {
      return NextResponse.json({ error: "Message content is required." }, { status: 400 });
    }
  }

  try {
    const message = await sendMessage(channelId, user.id, input);
    return NextResponse.json(message, { status: 201 });
  } catch (err) {
    if (err instanceof CommunityError) return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] });
    throw err;
  }
}
