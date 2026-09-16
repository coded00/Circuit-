/**
 * Circuit — real browser push, via OneSignal. Fills in the `PushChannel`
 * placeholder's original scope note in notifications.ts ("wire up web push
 * subscriptions here when that task starts"), but only for the broadcast
 * case (new-tournament/new-challenge announcements) — see notifyAllUsers.
 * The per-user PushChannel used by every other existing notification type
 * is untouched.
 *
 * Same degrade-to-console discipline as src/lib/email.ts's sendEmail: no
 * ONESIGNAL_API_KEY/app id configured (true for this environment today)
 * logs loudly instead of throwing, so the rest of the flow still works.
 */

const ONESIGNAL_API_URL = "https://onesignal.com/api/v1/notifications";

/**
 * One REST call, targeting OneSignal's built-in "Subscribed Users" segment
 * — every user who has actually granted browser push permission gets it in
 * a single request, not one request per user. That segment-broadcast
 * primitive is the whole reason to use OneSignal for this instead of
 * looping the per-user PushChannel.
 */
export async function sendPushToAll(title: string, message: string, url?: string): Promise<void> {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_API_KEY;

  if (!appId || !apiKey) {
    console.warn(`[push] OneSignal not configured — logging instead of sending.\nTitle: ${title}\nMessage: ${message}\n`);
    return;
  }

  const res = await fetch(ONESIGNAL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      included_segments: ["Subscribed Users"],
      headings: { en: title },
      contents: { en: message },
      ...(url ? { url } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[push] OneSignal send failed (${res.status}):`, body);
  }
}
