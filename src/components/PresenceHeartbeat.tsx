"use client";

/**
 * Circuit — Quick Match presence heartbeat. Mounted once for signed-in
 * users (src/app/layout.tsx, alongside OneSignalInit's own per-user
 * conditional). Pings while a tab is open so `User.lastActiveAt` stays
 * fresh enough for Quick Match's eligibility window to mean something —
 * see that field's schema comment.
 */

import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 25000;

export function PresenceHeartbeat() {
  useEffect(() => {
    function beat() {
      fetch("/api/presence/heartbeat", { method: "POST" }).catch(() => {
        // Ignored — the next interval tick retries. Same "a transient
        // network blip shouldn't crash this background ping" discipline
        // as NotificationBell's own poll.
      });
    }
    beat();
    const interval = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return null;
}
