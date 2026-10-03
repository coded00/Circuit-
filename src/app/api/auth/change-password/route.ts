/**
 * Circuit — change the password while signed in. Needs the current one, so
 * someone at an unattended screen can't lock the owner out. Accounts with no
 * password yet (Google sign-ups) add one through "Forgot password" instead.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { hashPassword, verifyPasswordTimingSafe } from "@/lib/auth";
import { isRateLimited, recordAttempt, clearAttempts } from "@/lib/rateLimit";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordRules";

const LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (!user.passwordHash) {
    return NextResponse.json({ error: "This account has no password yet. Use “Forgot password” on the login page to set one." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const current = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const next = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (next.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`, field: "newPassword" }, { status: 400 });
  }
  if (next === current) {
    return NextResponse.json({ error: "Choose a password that's different from your current one.", field: "newPassword" }, { status: 400 });
  }

  const key = `change-password:${user.id}`;
  const { limited, retryAfterSeconds } = await isRateLimited(key, LIMIT);
  if (limited) {
    return NextResponse.json({ error: `Too many attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).` }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });
  }

  if (!(await verifyPasswordTimingSafe(current, user.passwordHash))) {
    await recordAttempt(key);
    return NextResponse.json({ error: "That isn't your current password.", field: "currentPassword" }, { status: 400 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await clearAttempts(key);
  return NextResponse.json({ ok: true });
}
