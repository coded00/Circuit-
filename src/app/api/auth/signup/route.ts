/**
 * Circuit — signup (ACC-2, part of Build Plan P0-2).
 *
 * Handle/username is chosen by the player at signup, not auto-generated
 * (a prior version issued a random `player_xxxxxxxx` tag and deferred
 * customization to profile edit — no such edit path exists, and letting
 * every new account start with a generic tag was the actual complaint).
 * `displayName` still just mirrors `handle` — a separate display name is
 * a real ACC-6 profile-edit feature, not something this signup form
 * needs to also collect. Age-of-majority (ACC-3) is checked at
 * cash-touching actions, not here — see src/lib/age-gate.ts.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSessionToken, hashPassword, sessionCookie } from "@/lib/auth";
import { joinGlobalCommunity } from "@/lib/community";
import { isRateLimited, recordAttempt, clearAttempts } from "@/lib/rateLimit";

const MIN_PASSWORD_LENGTH = 8;
const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
// Same shape as login's own limit — keyed by the submitted identifier, not
// IP. This stops repeated automated attempts against one identifier (a
// guessed pending signup, a retry-spam loop); it does NOT by itself stop
// mass account creation using a fresh email/phone on every attempt — that
// needs IP-based throttling or a CAPTCHA, a bigger decision left for a
// follow-up rather than silently bundled into this fix.
const SIGNUP_MAX_ATTEMPTS = 5;
const SIGNUP_WINDOW_MS = 15 * 60 * 1000;

// Names that would be confusing or impersonation-prone as a public handle.
const RESERVED_HANDLES = new Set([
  "admin",
  "administrator",
  "staff",
  "support",
  "help",
  "circuit",
  "official",
  "moderator",
  "mod",
  "root",
  "system",
  "api",
  "null",
  "undefined",
]);

function validateHandle(raw: string): string | null {
  const handle = raw.trim().toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) {
    return null;
  }
  if (RESERVED_HANDLES.has(handle)) {
    return null;
  }
  return handle;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const rawHandle = typeof body?.handle === "string" ? body.handle : "";
  const emailOrPhone = typeof body?.emailOrPhone === "string" ? body.emailOrPhone.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!emailOrPhone || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Email or phone, and a password of at least ${MIN_PASSWORD_LENGTH} characters, are required.` },
      { status: 400 }
    );
  }

  const handle = validateHandle(rawHandle);
  if (!handle) {
    return NextResponse.json(
      { error: "Username must be 3-20 characters, using only letters, numbers, and underscores." },
      { status: 400 }
    );
  }

  const rateLimitKey = `signup:${emailOrPhone.toLowerCase()}`;
  const { limited, retryAfterSeconds } = await isRateLimited(rateLimitKey, {
    max: SIGNUP_MAX_ATTEMPTS,
    windowMs: SIGNUP_WINDOW_MS,
  });
  if (limited) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).` },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: { emailOrPhone, passwordHash, handle, displayName: handle },
    });
    await clearAttempts(rateLimitKey);

    // Every account is a member of Circuit's own platform-wide community
    // from the moment it exists — not something a new player has to
    // discover and opt into separately.
    await joinGlobalCommunity(user.id);

    const token = await createSessionToken({ userId: user.id });
    const response = NextResponse.json({ id: user.id, handle: user.handle }, { status: 201 });
    response.cookies.set(sessionCookie.name, token, sessionCookie);
    return response;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      await recordAttempt(rateLimitKey);
      const target = (err.meta?.target as string[] | undefined) ?? [];
      if (target.includes("handle")) {
        return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
      }
      if (target.includes("emailOrPhone")) {
        // Deliberately doesn't say "an account already exists" — unlike
        // the handle above (a public, self-chosen username, safe to
        // confirm), this field can be someone else's real email/phone, and
        // stating that outright is exactly the enumeration forgot-password
        // was already careful to avoid. Phrased conditionally instead.
        return NextResponse.json(
          { error: "Couldn't create your account. If you already have one, try logging in instead." },
          { status: 409 }
        );
      }
    }
    throw err;
  }
}
