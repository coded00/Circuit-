/**
 * Circuit — login (part of Build Plan P0-2, ACC-5).
 *
 * Throttled on three layers (rateLimit.ts, `AUTH_LIMITS.login`): 5 failed attempts per account per 15
 * minutes, 100 per caller, and 1000 platform-wide. Only failures count; a correct password clears the
 * account's bucket and deliberately leaves the caller's spent.
 *
 * The account layer is per *account*, not per identifier-as-typed: the two are not the same thing here,
 * because one account answers to several spellings of its phone number. See throttleKeyFor.
 */

import { NextResponse } from "next/server";
import { createSessionToken, sessionCookie, verifyPasswordTimingSafe } from "@/lib/auth";
import { AUTH_LIMITS, callerThrottleKeys, clearAttempts, isCallerThrottled, isRateLimited, recordAttempt, recordCallerAttempt } from "@/lib/rateLimit";
import { findUserByIdentifier, throttleKeyFor } from "@/lib/accountLookup";

const tooManyAttempts = (retryAfterSeconds: number) =>
  NextResponse.json(
    { error: `Too many attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );

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

  // The caller layers are checked before the account is looked up, because they need nothing from the
  // database: a source that has already spent its budget is refused without any work being done on its
  // behalf. That is the point of them under an attack, and it is what keeps a credential-stuffing run
  // from costing a query per guess. The account layer below still has to come after the lookup, because
  // its key *is* the account.
  const callerKeys = callerThrottleKeys("login", request);
  const callerThrottle = await isCallerThrottled("login", callerKeys);
  if (callerThrottle.limited) return tooManyAttempts(callerThrottle.retryAfterSeconds);

  // Email (any capitalisation) or phone (any common format).
  const user = await findUserByIdentifier(emailOrPhone);

  // Looked up before the throttle check, not after, because the throttle keys on the account rather than on
  // how it was typed: findUserByIdentifier folds every spelling of a phone number onto one account, so a key
  // built from the raw string gave each spelling its own 5-attempt window — five fresh guesses per
  // re-spelling, which is the throttle's whole job undone. See throttleKeyFor.
  const rateLimitKey = `login:${throttleKeyFor(user, emailOrPhone)}`;
  const { limited, retryAfterSeconds } = await isRateLimited(rateLimitKey, AUTH_LIMITS.login.identifier);
  if (limited) return tooManyAttempts(retryAfterSeconds);

  // Always runs bcrypt.compare, even for an unknown identifier — see
  // verifyPasswordTimingSafe's own comment on why that's load-bearing.
  const valid = await verifyPasswordTimingSafe(password, user?.passwordHash);

  if (!user || !valid) {
    await recordAttempt(rateLimitKey);
    await recordCallerAttempt(callerKeys);
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  // The account's own failures go; the caller buckets stay spent. Clearing them here would let anyone who
  // holds one valid credential reset their budget between guesses at everyone else's.
  await clearAttempts(rateLimitKey);
  const token = await createSessionToken({ userId: user.id });
  const response = NextResponse.json({ id: user.id, handle: user.handle });
  response.cookies.set(sessionCookie.name, token, sessionCookie);
  return response;
}
