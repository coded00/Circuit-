/**
 * Circuit — "You already have a Circuit account": the user confirms that
 * account's password once, and their Google identity is linked to it. The
 * existing account, its profile and all its data are untouched — this
 * only adds a way to sign in. Rate limited on the same key as login, so
 * this page can't be used to guess passwords faster than /login.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionToken, sessionCookie, verifyPasswordTimingSafe } from "@/lib/auth";
import { clearAttempts, isRateLimited, recordAttempt } from "@/lib/rateLimit";
import { attachGoogleIdentity, IdentityConflictError } from "@/lib/oauth/accounts";
import { clearedCookie, PENDING_COOKIE, readPendingCookie } from "@/lib/oauth/flowCookies";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const pending = await readPendingCookie((await cookies()).get(PENDING_COOKIE)?.value);
  if (!pending || pending.kind !== "link") {
    return NextResponse.json({ error: "This link request has expired. Please continue with Google again." }, { status: 410 });
  }

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) return NextResponse.json({ error: "Enter your Circuit password." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: pending.userId }, select: { id: true, emailOrPhone: true, passwordHash: true } });
  if (!user) return NextResponse.json({ error: "This link request has expired. Please continue with Google again." }, { status: 410 });

  const rateLimitKey = `login:${user.emailOrPhone.toLowerCase()}`;
  const { limited, retryAfterSeconds } = await isRateLimited(rateLimitKey, { max: MAX_ATTEMPTS, windowMs: WINDOW_MS });
  if (limited) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).` },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  if (!(await verifyPasswordTimingSafe(password, user.passwordHash))) {
    await recordAttempt(rateLimitKey);
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }
  await clearAttempts(rateLimitKey);

  try {
    await attachGoogleIdentity(user.id, pending.profile);
  } catch (err) {
    if (err instanceof IdentityConflictError) {
      return NextResponse.json(
        {
          error:
            err.code === "taken"
              ? "This Google account is already connected to a different Circuit account."
              : "This Circuit account is already connected to a different Google account.",
        },
        { status: 409 }
      );
    }
    throw err;
  }

  const response = NextResponse.json({ next: pending.next });
  response.cookies.set(sessionCookie.name, await createSessionToken({ userId: user.id }), sessionCookie);
  const cleared = clearedCookie(PENDING_COOKIE);
  response.cookies.set(cleared.name, cleared.value, cleared.options);
  return response;
}
