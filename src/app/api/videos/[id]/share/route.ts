/**
 * No auth required — sharing a public video isn't a per-user action that
 * needs a duplicate guard the way like/save do (spec section 13).
 *
 * V1 audit follow-up: same rate-limit gap as the view route's own
 * comment — this had nothing bounding a direct-hit script. Lower ceiling
 * than view (20 vs 60 per 5min) since a real share is a rarer, more
 * deliberate action than a view.
 */
import { NextResponse } from "next/server";
import { recordShare } from "@/lib/videos";
import { getClientIp, isRateLimited, recordAttempt } from "@/lib/rateLimit";

const SHARE_MAX_ATTEMPTS = 20;
const SHARE_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = `video-share:${getClientIp(request)}`;

  const { limited, retryAfterSeconds } = await isRateLimited(key, { max: SHARE_MAX_ATTEMPTS, windowMs: SHARE_WINDOW_MS });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }
  await recordAttempt(key);

  await recordShare(id);
  return NextResponse.json({ ok: true });
}
