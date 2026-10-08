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
 * Throttled on three layers (rateLimit.ts, `AUTH_LIMITS["forgot-password"]`): 3 requests per account per
 * 15 minutes, 30 per caller, 500 platform-wide — same Postgres-attempts-table design as login. Every call
 * counts on every layer, not just "failures": this route always returns the same generic response
 * regardless of what happened internally, so there's no success/failure signal to gate the count on the
 * way login has one.
 *
 * Per account rather than per identifier-as-typed, for the reason
 * throttleKeyFor sets out — one account answers to several spellings of
 * its phone number, and a bucket per spelling is unbounded reset mail.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generatePasswordResetToken } from "@/lib/auth";
import { findUserByIdentifier, throttleKeyFor } from "@/lib/accountLookup";
import { SITE_URL } from "@/lib/seo";
import { sendEmail } from "@/lib/email";
import { AUTH_LIMITS, callerThrottleKeys, isCallerThrottled, isRateLimited, recordAttempt, recordCallerAttempt } from "@/lib/rateLimit";

const GENERIC_MESSAGE = "If an account exists for that email, we've sent password reset instructions.";

const tooManyRequests = (retryAfterSeconds: number) =>
  NextResponse.json(
    { error: `Too many requests. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const emailOrPhone = typeof body?.emailOrPhone === "string" ? body.emailOrPhone.trim() : "";

  if (!emailOrPhone) {
    return NextResponse.json({ error: "Email or phone is required." }, { status: 400 });
  }

  // Checked before the lookup, like login's: a caller already over the line is refused without the
  // account query. This matters more here than anywhere else — every call this route lets through is
  // either a query or an email, and the attack it bounds is mailing a stranger's inbox.
  const callerKeys = callerThrottleKeys("forgot-password", request);
  const callerThrottle = await isCallerThrottled("forgot-password", callerKeys);
  if (callerThrottle.limited) return tooManyRequests(callerThrottle.retryAfterSeconds);

  const user = await findUserByIdentifier(emailOrPhone);

  // Keyed on the account, not on how it was typed — the same reason as login (see throttleKeyFor), and it
  // matters more here: a fresh bucket per re-spelling of a phone number is not password guesses, it is
  // unbounded reset mail into a victim's inbox, sent by whoever knows their number.
  const rateLimitKey = `forgot-password:${throttleKeyFor(user, emailOrPhone)}`;
  const { limited, retryAfterSeconds } = await isRateLimited(rateLimitKey, AUTH_LIMITS["forgot-password"].identifier);
  if (limited) return tooManyRequests(retryAfterSeconds);

  await recordAttempt(rateLimitKey);
  await recordCallerAttempt(callerKeys);

  const deliverTo = user?.email ?? (user?.emailOrPhone.includes("@") ? user.emailOrPhone : null);
  if (user && deliverTo) {
    const { raw, hash, expiresAt } = generatePasswordResetToken();
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hash, expiresAt } });

    const resetUrl = `${SITE_URL}/reset-password?token=${raw}`;
    await sendEmail(
      deliverTo,
      "Reset your Circuit password",
      `Someone (hopefully you) asked to reset the password for your Circuit account.\n\nReset it here. This link expires in 1 hour:\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`
    );
  }

  return NextResponse.json({ message: GENERIC_MESSAGE });
}
