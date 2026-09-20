/**
 * No auth, no duplicate guard by design — the client only calls this once
 * per video per session (sessionStorage dedupe in VideoCard), so this
 * stays a plain increment rather than needing its own join table.
 *
 * V1 audit follow-up: that "one call per session" discipline lives
 * entirely in the client, so an unauthenticated script hitting this route
 * directly had nothing bounding it — trivial view-count inflation. Rate
 * limited by IP (not auth — no userId to key on, and adding an auth
 * requirement would change the deliberate "no auth" behavior above, which
 * wasn't the gap being fixed). 60/5min is generous for genuine feed
 * scrolling (one call per video actually watched) while still blocking a
 * tight loop.
 */
import { NextResponse } from "next/server";
import { recordView } from "@/lib/videos";
import { getClientIp, isRateLimited, recordAttempt } from "@/lib/rateLimit";

const VIEW_MAX_ATTEMPTS = 60;
const VIEW_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = `video-view:${getClientIp(request)}`;

  const { limited, retryAfterSeconds } = await isRateLimited(key, { max: VIEW_MAX_ATTEMPTS, windowMs: VIEW_WINDOW_MS });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }
  // No success/failure signal to branch on (see rateLimit.ts's own
  // comment) — every call counts against the window, same as forgot-password.
  await recordAttempt(key);

  await recordView(id);
  return NextResponse.json({ ok: true });
}
