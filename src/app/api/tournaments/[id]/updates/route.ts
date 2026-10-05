/**
 * Circuit — post an organizer update on a tournament. Organizer only;
 * everyone entered is notified. Rate-limited so a stuck button can't flood
 * a field of players with notifications.
 */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";
import { postTournamentUpdate, UpdateError } from "@/lib/tournamentUpdates";

const LIMIT = { max: 10, windowMs: 60 * 60 * 1000 };
const STATUS = { NOT_FOUND: 404, FORBIDDEN: 403, INVALID: 400 } as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const key = `tournament-update:${user.id}`;
  const { limited, retryAfterSeconds } = await isRateLimited(key, LIMIT);
  if (limited) {
    return NextResponse.json({ error: `You've posted a lot of updates. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).` }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });
  }

  try {
    const update = await postTournamentUpdate({ tournamentId: id, authorId: user.id, body: body?.body });
    await recordAttempt(key);
    return NextResponse.json({ id: update.id }, { status: 201 });
  } catch (err) {
    if (err instanceof UpdateError) return NextResponse.json({ error: err.message }, { status: STATUS[err.code] });
    throw err;
  }
}
