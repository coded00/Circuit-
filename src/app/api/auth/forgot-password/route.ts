/**
 * Circuit — forgot password, step 1: request a reset link.
 *
 * Always returns the same generic response whether or not an account
 * exists, and whether `emailOrPhone` turns out to be an email or a phone
 * number — a response that varied by either would let someone enumerate
 * registered accounts.
 *
 * The account is found the same way login finds it (src/lib/accountLookup.ts):
 * email in any capitalisation — phone keyboards capitalise the first
 * letter, and the old exact match silently found nobody — or phone in any
 * common format. The link goes to the account's email; an account with no
 * email on file can't be reached yet (no SMS provider — see
 * docs/circuit-stack.md's Notifications section).
 *
 * Rate limited per identifier (3 requests per 15 minutes) — same
 * Postgres-attempts-table design as login (see rateLimit.ts). Every call
 * counts here, not just "failures": this route always returns the same
 * generic response regardless of what happened internally, so there's no
 * success/failure signal to gate the count on the way login has one.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generatePasswordResetToken } from "@/lib/auth";
import { findUserByIdentifier } from "@/lib/accountLookup";
import { SITE_URL } from "@/lib/seo";
import { sendEmail } from "@/lib/email";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";

const GENERIC_MESSAGE = "If an account exists for that email, we've sent password reset instructions.";
const MAX_ATTEMPTS = 3;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const emailOrPhone = typeof body?.emailOrPhone === "string" ? body.emailOrPhone.trim() : "";

  if (!emailOrPhone) {
    return NextResponse.json({ error: "Email or phone is required." }, { status: 400 });
  }

  const rateLimitKey = `forgot-password:${emailOrPhone.toLowerCase()}`;
  const { limited, retryAfterSeconds } = await isRateLimited(rateLimitKey, {
    max: MAX_ATTEMPTS,
    windowMs: WINDOW_MS,
  });
  if (limited) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).` },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }
  await recordAttempt(rateLimitKey);

  const user = await findUserByIdentifier(emailOrPhone);
  const deliverTo = user?.email ?? (user?.emailOrPhone.includes("@") ? user.emailOrPhone : null);
  if (user && deliverTo) {
    const { raw, hash, expiresAt } = generatePasswordResetToken();
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hash, expiresAt } });

    const resetUrl = `${SITE_URL}/reset-password?token=${raw}`;
    await sendEmail(
      deliverTo,
      "Reset your Circuit password",
      `Someone (hopefully you) asked to reset the password for your Circuit account.\n\nReset it here — this link expires in 1 hour:\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`
    );
  }

  return NextResponse.json({ message: GENERIC_MESSAGE });
}
