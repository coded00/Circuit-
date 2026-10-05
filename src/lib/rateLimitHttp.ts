/**
 * Circuit — a per-user cap on an action that costs other people something (a friend request, a team invite, a chat
 * message). Every call counts, because the point is to bound how often one account can do it, not to punish failures.
 * Returns the 429 response to send when the cap is hit, or null when the action may go ahead.
 */
import { NextResponse } from "next/server";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";

export async function limitOrRespond(key: string, limit: { max: number; windowMs: number }, message: string): Promise<NextResponse | null> {
  const { limited, retryAfterSeconds } = await isRateLimited(key, limit);
  if (limited) return NextResponse.json({ error: message }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });
  await recordAttempt(key);
  return null;
}
