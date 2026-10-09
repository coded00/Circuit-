/**
 * Circuit — the email Circuit sends to an address that already has an account, when somebody tries to
 * sign up with it.
 *
 * Finding #19. Signup used to answer a taken email or phone with a 409 naming the field, which told
 * anyone who asked whether a given address has a Circuit account — and on a platform that carries real
 * money and lets 13-year-olds join, a confirmed list of who is on it is worth something to somebody. The
 * fix is that signup now answers a conflict exactly as it answers a success, so the response carries
 * nothing; this email is where the truth goes instead, and only the owner of the address can read it.
 *
 * It is also why this needs a throttle of its own. Before, a conflict sent no mail at all; now every
 * conflict is a request to deliver to someone who did not ask. Without a per-address limit, the signup
 * route's caller and global buckets (30 and 500 per 15 minutes) would be a way to put hundreds of
 * messages an hour into a stranger's inbox — trading a privacy leak for a mail-bombing tool, which is
 * worse. The key is the address rather than the caller, so the ceiling holds no matter how many sources
 * ask, and one victim's hourly budget is theirs alone.
 */

import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/seo";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";

/** Deliveries to one address per hour. Same shape as the verification sender's own limit. */
const NOTICE_LIMIT = { max: 3, windowMs: 60 * 60 * 1000 };

/**
 * Tells the owner of `email` that someone tried to sign up with it. Best-effort: returns quietly when it
 * is throttled, because the caller answers identically either way and the send must never be what a
 * response's shape depends on.
 */
export async function sendAlreadyRegisteredNotice(email: string): Promise<void> {
  const key = `already-registered:${email.toLowerCase()}`;
  const { limited } = await isRateLimited(key, NOTICE_LIMIT);
  if (limited) return;
  await recordAttempt(key);

  await sendEmail(
    email,
    "Someone tried to sign up with your Circuit email",
    `Someone just tried to create a Circuit account using this email address. There is already an ` +
      `account for it, so nothing was created.\n\n` +
      `If that was you, log in instead — or reset your password if you have forgotten it:\n` +
      `${SITE_URL}/login\n${SITE_URL}/forgot-password\n\n` +
      `If it wasn't you, you can ignore this. Nobody can get into your account without your password, ` +
      `and we haven't told whoever it was that the address is registered.`
  );
}
