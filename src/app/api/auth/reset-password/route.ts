/**
 * Circuit — forgot password, step 2: consume the token and set a new
 * password. Rejects unknown, already-used, or expired tokens with one
 * generic error — same "don't leak which reason" posture as login's
 * "Invalid credentials." for a wrong password vs. an unknown account.
 *
 * On success, every other outstanding reset token for that user is also
 * marked used, so an earlier, still-unused reset email can't reset the
 * password again after this one already has.
 *
 * KNOWN GAP: existing sessions aren't revoked. Sessions are stateless
 * signed JWTs (src/lib/auth.ts) with no server-side session table, so
 * there's nothing to invalidate short of adding a session-version column
 * to User and checking it on every request — real scope beyond this
 * request, tracked here rather than silently assumed away. A session
 * issued before the reset stays valid until its own 30-day expiry.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, hashPasswordResetToken } from "@/lib/auth";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!token || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `A reset token and a password of at least ${MIN_PASSWORD_LENGTH} characters are required.` },
      { status: 400 }
    );
  }

  const tokenHash = hashPasswordResetToken(token);
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.updateMany({
      where: { userId: resetToken.userId, usedAt: null },
      data: { usedAt: now },
    }),
  ]);

  return NextResponse.json({ message: "Password updated. You can now log in." });
}
