/**
 * Circuit — transactional email. `docs/circuit-stack.md`'s Notifications
 * section names Resend as the intended email fallback but never wired it
 * up (no dependency installed, no key). Same class of gap as Paystack/
 * Flutterwave/Sentry elsewhere in this codebase: the integration point is
 * real, but it needs a real `RESEND_API_KEY` this environment doesn't
 * have. Rather than leave forgot-password with nowhere to send its link,
 * this degrades to logging the email to the server console when no key
 * is configured — loud and visible, not a silent no-op (same discipline
 * `PushChannel` in notifications.ts documents for its own not-yet-built
 * channel), so a developer can actually complete the flow locally.
 *
 * How much it logs is finding #18's subject: the message body is printed
 * in development and nowhere else. See logUndelivered.
 */

import { Resend } from "resend";

const FROM_ADDRESS = "Circuit <no-reply@circuit.app>";

/**
 * The no-provider fallback: nothing can be sent, so something must be said. What must *not* be said,
 * outside development, is the message body.
 *
 * Finding #18. This fallback used to print the whole message, and three of its five callers put a bearer
 * secret in one: the password-reset link (src/app/api/auth/forgot-password/route.ts), the email-verification
 * link (src/lib/emailVerification.ts) and a marketplace instant-download URL (src/lib/orderEmails.ts).
 * So a deploy that had simply not set `RESEND_API_KEY` — the exact deploy this fallback exists to make
 * visible — wrote working credentials into the log. A log is not a private place: it is a drain, a hosting
 * provider's retention window, an attachment on an error report, a screen somebody shares. Anyone who can
 * read that line can take the account the link was cut for, which is the one thing the link is for.
 *
 * So the body is printed in development — where the printed link is the only way to finish a reset or a
 * verification by hand, and the only reader is the developer who just asked for it — and nowhere else. The
 * test is `=== "development"` rather than `!== "production"` so an unset or unexpected `NODE_ENV` lands on
 * the quiet side: that this fallback is *loud* is its point, and that it is quiet about the body is this
 * one's.
 *
 * The recipient and the subject stay in both branches. They are what makes the warning diagnosable, and a
 * production deploy that cannot send email has to say so loudly — until the key is set, nobody can reset a
 * password, verify an address, or receive an order.
 */
function logUndelivered(to: string, subject: string, body: string): void {
  if (process.env.NODE_ENV === "development") {
    console.warn(
      `[email] RESEND_API_KEY not set. Logging instead of sending.\nTo: ${to}\nSubject: ${subject}\n\n${body}\n`
    );
    return;
  }

  console.warn(
    `[email] RESEND_API_KEY is not set, so nothing was sent — no password reset, verification link or ` +
      `order email can reach anyone until it is.\nTo: ${to}\nSubject: ${subject}`
  );
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logUndelivered(to, subject, text);
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from: FROM_ADDRESS, to, subject, text });
  if (error) {
    // Same reasoning as above: surface it loudly rather than swallowing it,
    // but don't throw — a delivery failure shouldn't 500 the caller (the
    // token still exists and the generic "check your email" response is
    // already the same either way, to avoid leaking account existence).
    console.error("[email] Resend send failed:", error);
  }
}

// Resend's batch endpoint caps at 100 emails per call.
const BATCH_CHUNK_SIZE = 100;

/**
 * Broadcast the same subject/text to many recipients at once — used by
 * notifyAllUsers (src/lib/notifications.ts) for new-tournament/new-challenge
 * announcements. One Resend API call per 100 recipients, not one per
 * recipient — the same reasoning sendPushToAll (src/lib/push.ts) documents
 * for using OneSignal's segment broadcast instead of a per-user loop.
 */
export async function sendEmailBatch(recipients: string[], subject: string, text: string): Promise<void> {
  if (recipients.length === 0) return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Same fallback as sendEmail, and the same gate on the body — this batch is announcements today, but
    // the rule is about the fallback rather than about the caller, so it holds for whatever is sent here
    // next.
    logUndelivered(`${recipients.length} recipients`, subject, text);
    return;
  }

  const resend = new Resend(apiKey);
  for (let i = 0; i < recipients.length; i += BATCH_CHUNK_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_CHUNK_SIZE);
    const { error } = await resend.batch.send(chunk.map((to) => ({ from: FROM_ADDRESS, to, subject, text })));
    if (error) {
      console.error("[email] Resend batch send failed:", error);
    }
  }
}
