/**
 * Circuit — forgot password, step 1: request a reset link.
 *
 * Always returns the same generic response whether or not an account
 * exists, and whether `emailOrPhone` turns out to be an email or a phone
 * number — a response that varied by either would let someone enumerate
 * registered accounts.
 *
 * Phone-registered accounts get no actual delivery: SMS is an explicitly
 * undecided channel (docs/circuit-stack.md's Notifications section), not
 * a silently-dropped one — this route just can't reach them yet, same
 * class of gap as the phone-number half of signup itself.
 *
 * KNOWN GAP: no rate limiting, matching login's own documented gap
 * (ACC-5) — this endpoint can be hit repeatedly to spam the same inbox.
 * Same fix (a Postgres attempts table, per docs/circuit-stack.md's Rate
 * limiting section) would cover both.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generatePasswordResetToken } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

const GENERIC_MESSAGE = "If an account exists for that email, we've sent password reset instructions.";

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const emailOrPhone = typeof body?.emailOrPhone === "string" ? body.emailOrPhone.trim() : "";

  if (!emailOrPhone) {
    return NextResponse.json({ error: "Email or phone is required." }, { status: 400 });
  }

  if (looksLikeEmail(emailOrPhone)) {
    const user = await prisma.user.findUnique({ where: { emailOrPhone } });
    if (user) {
      const { raw, hash, expiresAt } = generatePasswordResetToken();
      await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hash, expiresAt } });

      const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${raw}`;
      await sendEmail(
        emailOrPhone,
        "Reset your Circuit password",
        `Someone (hopefully you) asked to reset the password for your Circuit account.\n\nReset it here — this link expires in 1 hour:\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`
      );
    }
  }

  return NextResponse.json({ message: GENERIC_MESSAGE });
}
