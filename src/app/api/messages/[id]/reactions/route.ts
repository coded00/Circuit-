/**
 * Circuit Community — set one of your emoji reactions on a message on or
 * off: `{ emoji, on }`. Idempotent (not a blind toggle), so a double tap
 * or a retry lands in the state the user asked for. Returns the message's
 * resulting reactions; other viewers pick the change up on their next
 * poll via `reactionsSince`.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setReaction, CommunityError } from "@/lib/community";
import { communityErrorResponse } from "@/lib/communityHttp";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";

/** Generous for real use; stops a script hammering reactions on and off. */
const REACTION_RATE_LIMIT = { max: 120, windowMs: 60 * 1000 };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.on !== "boolean") {
    return NextResponse.json({ error: "Send { emoji, on }." }, { status: 400 });
  }

  const rateLimitKey = `chat-reaction:${user.id}`;
  const { limited, retryAfterSeconds } = await isRateLimited(rateLimitKey, REACTION_RATE_LIMIT);
  if (limited) {
    return NextResponse.json({ error: "Slow down a little." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });
  }
  await recordAttempt(rateLimitKey);

  const { id } = await params;
  try {
    return NextResponse.json(await setReaction(id, user.id, body.emoji, body.on));
  } catch (err) {
    if (err instanceof CommunityError) return communityErrorResponse(err);
    throw err;
  }
}
