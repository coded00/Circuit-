/**
 * Circuit — finishes a first-time Google sign-up: the user picked a
 * username (and optionally confirmed their name, country and games) on
 * /signup/complete. Creates the User + Google identity together, joins
 * the global community like email signup does, and signs them in.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSessionToken, sessionCookie } from "@/lib/auth";
import { HANDLE_RULES_MESSAGE, validateHandle } from "@/lib/handles";
import { createGoogleUser, NewAccountError } from "@/lib/oauth/accounts";
import { clearedCookie, PENDING_COOKIE, readPendingCookie } from "@/lib/oauth/flowCookies";

const MAX_DISPLAY_NAME = 40;
const MAX_REGION = 60;
const MAX_FAVORITE_GAMES = 6;

export async function POST(request: Request) {
  const pending = await readPendingCookie((await cookies()).get(PENDING_COOKIE)?.value);
  if (!pending || pending.kind !== "new") {
    return NextResponse.json({ error: "This sign-up has expired. Please continue with Google again." }, { status: 410 });
  }

  const body = await request.json().catch(() => null);
  const handle = validateHandle(typeof body?.handle === "string" ? body.handle : "");
  if (!handle) return NextResponse.json({ error: HANDLE_RULES_MESSAGE }, { status: 400 });

  const displayName = (typeof body?.displayName === "string" ? body.displayName.trim() : "") || handle;
  if (displayName.length > MAX_DISPLAY_NAME) {
    return NextResponse.json({ error: `Display name must be ${MAX_DISPLAY_NAME} characters or fewer.` }, { status: 400 });
  }
  const region = typeof body?.region === "string" ? body.region.trim() : "";
  if (region.length > MAX_REGION) return NextResponse.json({ error: `Country must be ${MAX_REGION} characters or fewer.` }, { status: 400 });
  const games = Array.isArray(body?.favoriteGames)
    ? [...new Set((body.favoriteGames as unknown[]).filter((g): g is string => typeof g === "string").map((g) => g.trim()).filter(Boolean))]
    : [];
  if (games.length > MAX_FAVORITE_GAMES) return NextResponse.json({ error: `Pick up to ${MAX_FAVORITE_GAMES} games.` }, { status: 400 });

  let user;
  try {
    user = await createGoogleUser(pending.profile, {
      handle,
      displayName,
      region: region || null,
      favoriteGames: games,
      useGooglePhoto: body?.useGooglePhoto !== false,
    });
  } catch (err) {
    if (err instanceof NewAccountError) {
      if (err.code === "handle_taken") return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
      // Someone registered this email (or this Google account) meanwhile —
      // start over so the normal existing-account path takes it.
      return NextResponse.json({ error: "An account for this Google login already exists. Please continue with Google again." }, { status: 409 });
    }
    throw err;
  }

  const response = NextResponse.json({ next: pending.next });
  response.cookies.set(sessionCookie.name, await createSessionToken({ userId: user.id }), sessionCookie);
  const cleared = clearedCookie(PENDING_COOKIE);
  response.cookies.set(cleared.name, cleared.value, cleared.options);
  return response;
}
