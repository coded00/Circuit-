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
 */

import { Resend } from "resend";

const FROM_ADDRESS = "Circuit <no-reply@circuit.app>";

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY not set — logging instead of sending.\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`
    );
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
    console.warn(
      `[email] RESEND_API_KEY not set — logging instead of sending.\nTo: ${recipients.length} recipients\nSubject: ${subject}\n\n${text}\n`
    );
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
