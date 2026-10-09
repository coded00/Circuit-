/**
 * Circuit — email signup (ACC-2), fed by the multi-step form on /signup.
 * Collects name, email, password (+ confirmation), terms acceptance,
 * username, country, date of birth and an optional Nigerian mobile
 * number; everything is re-validated here. Games, avatar and bio are
 * saved by the form afterwards, through the signed-in endpoints.
 *
 * - Email is stored lowercased as the login identifier (and as `email`),
 *   and checked case-insensitively so "Ada@x.com" can't register twice.
 * - Phone is optional; when given it's normalised to +234… (src/lib/phone.ts)
 *   — not SMS-verified.
 * - Date of birth must be 13+ (src/lib/age.ts); the separate 18+ rule for
 *   paid entry and payouts still lives in src/lib/age-gate.ts.
 *
 * Errors carry `field` so the form can jump back to the step that needs
 * fixing — with one deliberate exception. An email or phone that is already
 * on an account is answered exactly like a successful signup when email can
 * be delivered, because any distinguishable answer tells a stranger whether
 * an address is registered (finding #19; see canDeliverEmail below). Handles
 * keep their plain 409: they are public by design.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { sendAlreadyRegisteredNotice } from "@/lib/accountEmails";
import { sendVerificationEmail } from "@/lib/emailVerification";
import { prisma } from "@/lib/db";
import { createSessionToken, hashPassword, sessionCookie } from "@/lib/auth";
import { joinGlobalCommunity } from "@/lib/community";
import { AUTH_LIMITS, callerThrottleKeys, clearAttempts, isCallerThrottled, isRateLimited, recordAttempt, recordCallerAttempt } from "@/lib/rateLimit";
import { HANDLE_RULES_MESSAGE, validateHandle } from "@/lib/handles";
import { normalizeNigerianPhone } from "@/lib/phone";
import { isCountryCode } from "@/lib/countries";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordRules";
import { parseSignupDateOfBirth } from "@/lib/age";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Throttled on three layers (rateLimit.ts, `AUTH_LIMITS.signup`): 5 attempts per email, 30 per caller and
// 500 platform-wide per 15 minutes. The per-email bucket alone never stopped mass creation with fresh
// addresses — each new email opened a window of its own — which is what the caller and global buckets are
// for. Unlike login's, the caller buckets count attempts that *succeed*, because that is the attack here.

const EXISTING_ACCOUNT_MESSAGE = "Couldn't create your account. If you already have one, try logging in instead.";

/**
 * Whether this request can send email at all — and so whether signup hands the caller a session or a
 * trip to their inbox (finding #19).
 *
 * With a provider configured, a fresh signup and a taken email or phone get the **same** 201, the same
 * body and no cookie either way; the account is created, a verification link is sent, and the caller
 * proves the address before they can get in. Without one, nothing can be delivered, so deferring the
 * session would lock every new account out of a site they cannot finish joining — and this falls back to
 * the old behaviour, session and per-field 409 included.
 *
 * Read per request rather than at import, so a test (or a restart with a different environment) changes
 * it. `docs/pre-launch-checklist.md` requires the key in production, so every real deployment takes the
 * deferred branch; the fallback is for local work and the test suite.
 *
 * Note what is *not* used as the switch: `emailVerificationEnforced()` (src/lib/emailGate.ts). That
 * answers a different question — whether money actions may demand verification — and it is false when
 * `REQUIRE_VERIFIED_EMAIL=false` even though email works fine. What matters here is only whether a link
 * can be delivered, because that is the one thing the deferred flow cannot do without.
 */
const canDeliverEmail = () => Boolean(process.env.RESEND_API_KEY);

/**
 * The answer to an email or phone that is already on an account, in the mode where signup does not sign
 * anyone in (finding #19). Byte-for-byte what a successful signup returns: same status, same body, no
 * cookie — so the response says nothing about whether the address was free.
 *
 * `handle` is the caller's own, and safe to echo: a taken one is refused separately, and handles are
 * public by design (see src/app/api/auth/handle-available/route.ts). The password has already been
 * hashed on the way in, so this costs what the success path costs. The account's owner is told by email;
 * the caller is told nothing.
 *
 * The address the notice goes to is looked up rather than assumed. When the clash is on the phone number,
 * the person who owns it may never have used — or seen — the address this caller typed, and telling the
 * caller's own address that "someone tried to sign up with it" would be both useless and untrue.
 */
async function alreadyRegistered(email: string, phone: string | null, handle: string) {
  const owner = await prisma.user.findFirst({
    where: {
      OR: [
        { emailOrPhone: { equals: email, mode: "insensitive" } },
        { email: { equals: email, mode: "insensitive" } },
        ...(phone ? [{ phone }, { emailOrPhone: phone }] : []),
      ],
    },
    select: { email: true, emailOrPhone: true },
  });
  // A conflict on an identifier with no address on it has nobody to tell; the response is the same either
  // way, which is the property that matters.
  const ownerEmail = owner?.email ?? (owner?.emailOrPhone.includes("@") ? owner.emailOrPhone : null);
  if (ownerEmail) await sendAlreadyRegisteredNotice(ownerEmail);

  return NextResponse.json({ pending: true, handle }, { status: 201 });
}

type Field = "name" | "email" | "password" | "confirmPassword" | "terms" | "handle" | "country" | "phone" | "dateOfBirth";
const MAX_NAME_LENGTH = 40;
const fail = (field: Field, error: string, status = 400) => NextResponse.json({ error, field }, { status });

// No `field`: being over the limit is not a problem with anything the form sent, and pinning it to one
// input would send the user back to a step that is fine.
const tooManyAttempts = (retryAfterSeconds: number) =>
  NextResponse.json(
    { error: `Too many attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const str = (key: string) => (typeof body?.[key] === "string" ? (body[key] as string) : "");

  const name = str("name").trim().replace(/\s+/g, " ");
  if (!name) return fail("name", "Enter your name.");
  if (name.length > MAX_NAME_LENGTH) return fail("name", `Keep your name to ${MAX_NAME_LENGTH} characters or fewer.`);
  const email = str("email").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return fail("email", "Enter a valid email address.");
  const password = str("password");
  if (password.length < MIN_PASSWORD_LENGTH) return fail("password", `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (str("confirmPassword") !== password) return fail("confirmPassword", "Passwords don't match.");
  if (body?.acceptTerms !== true) return fail("terms", "Accept the Terms and Privacy Policy to join.");
  const handle = validateHandle(str("handle"));
  if (!handle) return fail("handle", HANDLE_RULES_MESSAGE);
  const country = str("country");
  if (!isCountryCode(country)) return fail("country", "Choose your country.");
  const phoneInput = str("phone").trim();
  const phone = phoneInput ? normalizeNigerianPhone(phoneInput) : null;
  if (phoneInput && !phone) return fail("phone", "Enter a Nigerian mobile number, e.g. 0803 123 4567. Or leave it blank.");
  const dob = parseSignupDateOfBirth(body?.dateOfBirth);
  if (!dob.ok) return fail("dateOfBirth", dob.error);

  // Every attempt that gets this far counts against the caller buckets, successful or not — mass account
  // creation is an attack that works, so a rule counting only failures would not see it. Malformed fields
  // are deliberately not counted: nothing past this point touches the database, and spending a shared
  // address's budget on a client that cannot spell its own birthday is the wrong trade.
  const callerKeys = callerThrottleKeys("signup", request);
  const callerThrottle = await isCallerThrottled("signup", callerKeys);
  if (callerThrottle.limited) return tooManyAttempts(callerThrottle.retryAfterSeconds);

  const rateLimitKey = `signup:${email}`;
  const { limited, retryAfterSeconds } = await isRateLimited(rateLimitKey, AUTH_LIMITS.signup.identifier);
  if (limited) return tooManyAttempts(retryAfterSeconds);
  await recordCallerAttempt(callerKeys);

  const deferred = canDeliverEmail();

  // Hashed *before* the checks below rather than after them, which is finding #19's timing half. bcrypt
  // dominates this handler, and a conflict that returned without hashing would come back an order of
  // magnitude faster than a success — an oracle that survives any change to the response itself, so a fix
  // that only made the responses match would have been theatre.
  const passwordHash = await hashPassword(password);

  // Case-insensitive checks the unique indexes can't do on their own.
  const [emailTaken, phoneTaken] = await Promise.all([
    prisma.user.findFirst({
      where: { OR: [{ emailOrPhone: { equals: email, mode: "insensitive" } }, { email: { equals: email, mode: "insensitive" } }] },
      select: { id: true },
    }),
    phone ? prisma.user.findFirst({ where: { OR: [{ phone }, { emailOrPhone: phone }] }, select: { id: true } }) : null,
  ]);
  if (emailTaken || phoneTaken) {
    // Counted either way: the cost of asking has to be real, or probing is free.
    await recordAttempt(rateLimitKey);
    if (deferred) return alreadyRegistered(email, phone, handle);
    return fail(emailTaken ? "email" : "phone", EXISTING_ACCOUNT_MESSAGE, 409);
  }

  try {
    const user = await prisma.user.create({
      data: { emailOrPhone: email, email, phone, country, termsAcceptedAt: new Date(), dateOfBirth: dob.date, passwordHash, handle, displayName: name },
    });
    await clearAttempts(rateLimitKey);

    // Every account is a member of Circuit's own platform-wide community
    // from the moment it exists.
    await joinGlobalCommunity(user.id);
    // Best-effort: a failed send just means they resend from Account settings.
    await sendVerificationEmail(user).catch(() => undefined);

    // Finding #19: the same 201 the conflict above returns, and no cookie — the account exists but the
    // address is unproven until the link in that email is opened (/verify-email), so there is nothing to
    // sign in with yet. Signing in here instead would make this response distinguishable from the
    // conflict's by its Set-Cookie header alone, which is as readable as the 409 it replaced.
    if (deferred) return NextResponse.json({ pending: true, handle: user.handle }, { status: 201 });

    const token = await createSessionToken({ userId: user.id });
    const response = NextResponse.json({ id: user.id, handle: user.handle }, { status: 201 });
    response.cookies.set(sessionCookie.name, token, sessionCookie);
    return response;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      await recordAttempt(rateLimitKey);
      const target = (err.meta?.target as string[] | undefined) ?? [];
      // A taken handle is refused plainly in both modes: it is public information, and
      // `/api/auth/handle-available` already answers it for anyone who asks.
      if (target.includes("handle")) return fail("handle", "That username is already taken.", 409);
      // The rest is the race the pre-check above cannot close — someone registered this address between
      // our `findFirst` and our `create`. Same answer as the pre-check, by the same helper.
      if (deferred) return alreadyRegistered(email, phone, handle);
      if (target.includes("phone")) return fail("phone", EXISTING_ACCOUNT_MESSAGE, 409);
      return fail("email", EXISTING_ACCOUNT_MESSAGE, 409);
    }
    throw err;
  }
}
