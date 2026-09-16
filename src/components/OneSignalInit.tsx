"use client";

/**
 * Circuit — subscribes a signed-in user to real browser push via OneSignal,
 * mounted once in the root layout. Fills the PushChannel placeholder's own
 * scope note in src/lib/notifications.ts, but the subscription side only —
 * actually sending still goes through src/lib/push.ts's broadcast call, not
 * per-user targeting here.
 *
 * `notifyNewContent` is the same Account Settings toggle that gates the
 * email side of notifyAllUsers — reacts to it going either direction so
 * turning the preference off also opts the browser subscription out, not
 * just future sends.
 */

import { useEffect, useRef } from "react";
import OneSignal from "react-onesignal";

let sdkInitPromise: Promise<void> | null = null;

async function ensureInitialized(appId: string, userId: string): Promise<void> {
  if (!sdkInitPromise) {
    sdkInitPromise = OneSignal.init({ appId }).then(() => OneSignal.login(userId));
  }
  return sdkInitPromise;
}

export function OneSignalInit({ userId, notifyNewContent }: { userId: string; notifyNewContent: boolean }) {
  const syncedPlayerId = useRef(false);

  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId) return;

    let cancelled = false;

    (async () => {
      try {
        await ensureInitialized(appId, userId);
        if (cancelled) return;

        if (!notifyNewContent) {
          await OneSignal.User.PushSubscription.optOut();
          return;
        }

        await OneSignal.User.PushSubscription.optIn();
        await OneSignal.Notifications.requestPermission();

        const syncPlayerId = () => {
          const id = OneSignal.User.PushSubscription.id;
          if (id && !syncedPlayerId.current) {
            syncedPlayerId.current = true;
            fetch("/api/account", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ oneSignalPlayerId: id }),
            }).catch(() => {});
          }
        };
        syncPlayerId();
        OneSignal.User.PushSubscription.addEventListener("change", syncPlayerId);
      } catch (err) {
        // Push is a fallback channel, not launch-blocking — a misconfigured
        // OneSignal app id or a browser that refuses the permission prompt
        // shouldn't break anything else on the page.
        console.warn("[push] OneSignal init failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, notifyNewContent]);

  return null;
}
