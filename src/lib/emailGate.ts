/**
 * Circuit — a verified email is required before money moves: paid tournament
 * entry, staking in a challenge, withdrawing, and claiming a prize. It sits
 * beside the age check on those routes.
 *
 * Enforcement follows whether verification can actually happen. Without an
 * email provider (RESEND_API_KEY) no verification link can be sent, so
 * requiring it would lock everyone out of paid actions; it switches on by
 * itself once email is configured. REQUIRE_VERIFIED_EMAIL=true forces it on
 * (handy locally, where the link is printed to the server log), =false forces
 * it off. Google sign-ups arrive already verified.
 */

import { NextResponse } from "next/server";

export function emailVerificationEnforced(): boolean {
  const flag = process.env.REQUIRE_VERIFIED_EMAIL?.trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return Boolean(process.env.RESEND_API_KEY);
}

export const EMAIL_NOT_VERIFIED_MESSAGE =
  "Verify your email before this. Open Account settings, send yourself a verification link, and click it. Then come back.";

/** Whether this user is blocked from money actions for want of a verified email. */
export function needsEmailVerification(user: { emailVerifiedAt: Date | null }): boolean {
  return emailVerificationEnforced() && !user.emailVerifiedAt;
}

/** For API routes: a ready 403 response when blocked, otherwise null. */
export function emailVerificationRequired(user: { emailVerifiedAt: Date | null }): NextResponse | null {
  if (!needsEmailVerification(user)) return null;
  return NextResponse.json({ error: EMAIL_NOT_VERIFIED_MESSAGE, code: "EMAIL_NOT_VERIFIED" }, { status: 403 });
}
