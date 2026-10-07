/**
 * Circuit — login (part of Build Plan P0-2, ACC-5).
 *
 * Rate limited per account (not per IP — see rateLimit.ts): 5 failed
 * attempts per 15 minutes, matching the docs/circuit-stack.md Rate
 * limiting section's Postgres-attempts-table design. Only failures count
 * against the limit; a correct password always clears it.
 *
 * Per account, not per identifier-as-typed: the two are not the same thing
 * here, because one account answers to several spellings of its phone
 * number. See throttleKeyFor.
 */

import { NextResponse } from "next/server";
import { createSessionToken, sessionCookie, verifyPasswordTimingSafe } from "@/lib/auth";
import { isRateLimited, recordAttempt, clearAttempts } from "@/lib/rateLimit";
import { findUserByIdentifier, throttleKeyFor } from "@/lib/accountLookup";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const emailOrPhone =
    typeof body?.emailOrPhone === "string" ? body.emailOrPhone.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!emailOrPhone || !password) {
    return NextResponse.json(
      { error: "Email/phone and password are required." },
      { status: 400 }
    );
  }

  // Email (any capitalisation) or phone (any common format).
  const user = await findUserByIdentifier(emailOrPhone);

  // Looked up before the throttle check, not after, because the throttle keys on the account rather than on
  // how it was typed: findUserByIdentifier folds every spelling of a phone number onto one account, so a key
  // built from the raw string gave each spelling its own 5-attempt window — five fresh guesses per
  // re-spelling, which is the throttle's whole job undone. See throttleKeyFor.
  const rateLimitKey = `login:${throttleKeyFor(user, emailOrPhone)}`;
  const { limited, retryAfterSeconds } = await isRateLimited(rateLimitKey, {
    max: MAX_ATTEMPTS,
    windowMs: WINDOW_MS,
  });
  if (limited) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).` },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  // Always runs bcrypt.compare, even for an unknown identifier — see
  // verifyPasswordTimingSafe's own comment on why that's load-bearing.
  const valid = await verifyPasswordTimingSafe(password, user?.passwordHash);

  if (!user || !valid) {
    await recordAttempt(rateLimitKey);
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  await clearAttempts(rateLimitKey);
  const token = await createSessionToken({ userId: user.id });
  const response = NextResponse.json({ id: user.id, handle: user.handle });
  response.cookies.set(sessionCookie.name, token, sessionCookie);
  return response;
}
