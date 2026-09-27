/**
 * Circuit — proving an account owns its email. A one-time link (24h) is
 * emailed; opening it sets User.emailVerifiedAt. Required before creating
 * a community. Google sign-up counts as verified (Google checked the
 * address). Changing the email clears it.
 *
 * Without RESEND_API_KEY the email is logged to the server console (see
 * src/lib/email.ts), so the flow still works locally.
 */

import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/seo";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const SEND_LIMIT = { max: 3, windowMs: 60 * 60 * 1000 };

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** The address a user's verification goes to (email accounts store it in both fields). */
export function accountEmail(user: { email: string | null; emailOrPhone: string }): string | null {
  return user.email ?? (user.emailOrPhone.includes("@") ? user.emailOrPhone : null);
}

export type SendResult = { ok: true } | { ok: false; reason: "no_email" | "already_verified" | "rate_limited"; retryAfterSeconds?: number };

export async function sendVerificationEmail(user: { id: string; email: string | null; emailOrPhone: string; emailVerifiedAt: Date | null }): Promise<SendResult> {
  const email = accountEmail(user);
  if (!email) return { ok: false, reason: "no_email" };
  if (user.emailVerifiedAt) return { ok: false, reason: "already_verified" };

  const key = `verify-email:${user.id}`;
  const { limited, retryAfterSeconds } = await isRateLimited(key, SEND_LIMIT);
  if (limited) return { ok: false, reason: "rate_limited", retryAfterSeconds };
  await recordAttempt(key);

  const raw = randomBytes(32).toString("hex");
  await prisma.emailVerificationToken.create({
    data: { userId: user.id, email: email.toLowerCase(), tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
  });
  await sendEmail(
    email,
    "Verify your Circuit email",
    `Confirm this is your email to finish setting up your Circuit account.\n\nVerify here — this link expires in 24 hours:\n${SITE_URL}/verify-email?token=${raw}\n\nIf you didn't create a Circuit account, you can ignore this email.`
  );
  return { ok: true };
}

export type VerifyResult = "verified" | "already" | "invalid" | "expired" | "changed";

/** Consumes a link. Only valid if the account's email is still the one it was sent to. */
export async function verifyEmailToken(raw: string): Promise<VerifyResult> {
  if (!/^[a-f0-9]{64}$/.test(raw)) return "invalid";
  const token = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: { select: { id: true, email: true, emailOrPhone: true, emailVerifiedAt: true } } },
  });
  if (!token) return "invalid";
  if (token.usedAt) return token.user.emailVerifiedAt ? "already" : "invalid";
  if (token.expiresAt <= new Date()) return "expired";
  if (accountEmail(token.user)?.toLowerCase() !== token.email) return "changed";

  const now = new Date();
  await prisma.$transaction([
    prisma.emailVerificationToken.update({ where: { id: token.id }, data: { usedAt: now } }),
    prisma.user.update({ where: { id: token.user.id }, data: { emailVerifiedAt: token.user.emailVerifiedAt ?? now } }),
  ]);
  return token.user.emailVerifiedAt ? "already" : "verified";
}
