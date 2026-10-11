"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/** V1's "live" pages, polling-style rather than a WebSocket — see
 *  docs/circuit-stack.md's Live-ish updates section for why. Used by the
 *  bracket view (BRK-7), the open Battle board (BTL-2) and a few waiting pages.
 *
 *  A refresh re-renders the whole server page, so it must never land while the
 *  player is in the middle of something: it skips a tick while the tab is
 *  hidden, while the page is being scrolled or touched, while they are typing,
 *  and while a dialog is open. It refreshes in a transition so the screen
 *  stays responsive, and catches up as soon as the tab is visible again. */
export default function Poller({ intervalMs = 8000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const lastActivity = useRef(0);

  useEffect(() => {
    const touch = () => {
      lastActivity.current = Date.now();
    };
    const events = ["scroll", "touchstart", "touchmove", "wheel", "keydown", "pointerdown"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));

    function busy() {
      if (document.visibilityState !== "visible") return true;
      if (Date.now() - lastActivity.current < 1500) return true;
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
      return !!document.querySelector('[role="dialog"][aria-modal="true"]');
    }

    const refresh = () => {
      if (!busy()) startTransition(() => router.refresh());
    };
    const interval = setInterval(refresh, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      events.forEach((e) => window.removeEventListener(e, touch, { capture: true }));
    };
  }, [router, intervalMs]);

  return null;
}
