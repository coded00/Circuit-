/**
 * Circuit — email signup (ACC-2), fed by the multi-step form on /signup.
 * Collects email, password (+ confirmation), username, a Nigerian mobile
 * number and date of birth; everything is re-validated here.
 *
 * - Email is stored lowercased as the login identifier (and as `email`),
 *   and checked case-insensitively so "Ada@x.com" can't register twice.
 * - Phone is normalised to +234… (src/lib/phone.ts) — not SMS-verified.
 * - Date of birth must be 13+ (src/lib/age.ts); the separate 18+ rule for
 *   paid entry and payouts still lives in src/lib/age-gate.ts.
 *
 * Errors carry `field` so the form can jump back to the step that needs
 * fixing. Email/phone conflicts are worded conditionally ("if you already
 * have one…") rather than confirming an account exists.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSessionToken, hashPassword, sessionCookie } from "@/lib/auth";
import { joinGlobalCommunity } from "@/lib/community";
import { isRateLimited, recordAttempt, clearAttempts } from "@/lib/rateLimit";
import { HANDLE_RULES_MESSAGE, validateHandle } from "@/lib/handles";
import { normalizeNigerianPhone } from "@/lib/phone";
import { parseSignupDateOfBirth } from "@/lib/age";

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Keyed by the submitted email, not IP. This stops repeated automated
// attempts against one identifier; it does NOT by itself stop mass
// account creation with fresh emails — that needs IP throttling or a
// CAPTCHA, a separate decision.
const SIGNUP_MAX_ATTEMPTS = 5;
const SIGNUP_WINDOW_MS = 15 * 60 * 1000;

const EXISTING_ACCOUNT_MESSAGE = "Couldn't create your account. If you already have one, try logging in instead.";

type Field = "email" | "password" | "confirmPassword" | "handle" | "phone" | "dateOfBirth";
const fail = (field: Field, error: string, status = 400) => NextResponse.json({ error, field }, { status });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const str = (key: string) => (typeof body?.[key] === "string" ? (body[key] as string) : "");

  const email = str("email").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return fail("email", "Enter a valid email address.");
  const password = str("password");
  if (password.length < MIN_PASSWORD_LENGTH) return fail("password", `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (str("confirmPassword") !== password) return fail("confirmPassword", "Passwords don't match.");
  const handle = validateHandle(str("handle"));
  if (!handle) return fail("handle", HANDLE_RULES_MESSAGE);
  const phone = normalizeNigerianPhone(str("phone"));
  if (!phone) return fail("phone", "Enter a Nigerian mobile number, e.g. 0803 123 4567.");
  const dob = parseSignupDateOfBirth(body?.dateOfBirth);
  if (!dob.ok) return fail("dateOfBirth", dob.error);

  const rateLimitKey = `signup:${email}`;
  const { limited, retryAfterSeconds } = await isRateLimited(rateLimitKey, { max: SIGNUP_MAX_ATTEMPTS, windowMs: SIGNUP_WINDOW_MS });
  if (limited) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).` },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  // Case-insensitive checks the unique indexes can't do on their own.
  const [emailTaken, phoneTaken] = await Promise.all([
    prisma.user.findFirst({
      where: { OR: [{ emailOrPhone: { equals: email, mode: "insensitive" } }, { email: { equals: email, mode: "insensitive" } }] },
      select: { id: true },
    }),
    prisma.user.findFirst({ where: { OR: [{ phone }, { emailOrPhone: phone }] }, select: { id: true } }),
  ]);
  if (emailTaken) {
    await recordAttempt(rateLimitKey);
    return fail("email", EXISTING_ACCOUNT_MESSAGE, 409);
  }
  if (phoneTaken) {
    await recordAttempt(rateLimitKey);
    return fail("phone", "That phone number is already on an account. If it's yours, try logging in instead.", 409);
  }

  const passwordHash = await hashPassword(password);
  try {
    const user = await prisma.user.create({
      data: { emailOrPhone: email, email, phone, dateOfBirth: dob.date, passwordHash, handle, displayName: handle },
    });
    await clearAttempts(rateLimitKey);

    // Every account is a member of Circuit's own platform-wide community
    // from the moment it exists.
    await joinGlobalCommunity(user.id);

    const token = await createSessionToken({ userId: user.id });
    const response = NextResponse.json({ id: user.id, handle: user.handle }, { status: 201 });
    response.cookies.set(sessionCookie.name, token, sessionCookie);
    return response;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      await recordAttempt(rateLimitKey);
      const target = (err.meta?.target as string[] | undefined) ?? [];
      if (target.includes("handle")) return fail("handle", "That username is already taken.", 409);
      if (target.includes("phone")) return fail("phone", "That phone number is already on an account. If it's yours, try logging in instead.", 409);
      return fail("email", EXISTING_ACCOUNT_MESSAGE, 409);
    }
    throw err;
  }
}
