/**
 * Circuit — login (part of Build Plan P0-2, ACC-5).
 *
 * Rate limited per identifier (not per IP — see rateLimit.ts): 5 failed
 * attempts per 15 minutes, matching the docs/circuit-stack.md Rate
 * limiting section's Postgres-attempts-table design. Only failures count
 * against the limit; a correct password always clears it.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionToken, sessionCookie, verifyPassword } from "@/lib/auth";
import { isRateLimited, recordAttempt, clearAttempts } from "@/lib/rateLimit";

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

  const rateLimitKey = `login:${emailOrPhone.toLowerCase()}`;
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

  const user = await prisma.user.findUnique({ where: { emailOrPhone } });
  const valid = user?.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : false;

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
