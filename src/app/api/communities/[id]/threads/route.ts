/**
 * Circuit — a community's threads. GET lists the most recently active;
 * POST { channelId, title?, messageId? } starts one (from a message, its
 * text is the default title).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createThread, listThreads } from "@/lib/communityThreads";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json({ threads: await listThreads(id, user) });
  } catch (err) {
    return handleCommunityError(err);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const body = await jsonBody(request);
  if (typeof body.channelId !== "string") return NextResponse.json({ error: "Which channel?" }, { status: 400 });
  const key = `thread-create:${user.id}`;
  if ((await isRateLimited(key, { max: 20, windowMs: 60 * 60 * 1000 })).limited) {
    return NextResponse.json({ error: "You've started a lot of threads. Try again later." }, { status: 429 });
  }
  try {
    const thread = await createThread(body.channelId, user, body);
    await recordAttempt(key);
    return NextResponse.json({ id: thread.id, title: thread.title }, { status: 201 });
  } catch (err) {
    return handleCommunityError(err);
  }
}
