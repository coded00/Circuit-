"use client";

/**
 * Circuit — notification bell + slide-in panel. Its own setInterval +
 * fetch, not a rendered <Poller/> — Poller's router.refresh() re-runs a
 * whole Server Component page, the wrong mechanism for a header-mounted
 * badge that needs local client state instead.
 *
 * Same open/backdrop/click-outside shape as AdminMobileNav's drawer
 * (globals.css's own comment on that pattern), mirrored to the right
 * edge, with framer-motion driving the enter/exit animation instead of
 * the CSS-only `.drawer-panel-enter` keyframe — that class has no exit
 * animation (the drawer just unmounts), and this panel needs one both
 * ways.
 *
 * Rendered via a portal to `document.body`, not inline where this
 * component sits in TopBar's tree: TopBar's header bar has
 * `backdrop-blur-md`, and `backdrop-filter` establishes a new containing
 * block for `position: fixed` descendants (same rule as `transform`) —
 * without the portal, this panel's `fixed inset-y-0` computes against
 * that 60px header bar instead of the viewport, clipping it to the
 * header's own height.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, X } from "lucide-react";
import { getNotificationCategory, NOTIFICATION_ICON_CLASS_NAME } from "@/lib/notification-icon";

type NotificationRow = {
  id: string;
  type: string;
  message: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

const POLL_INTERVAL_MS = 5000;
const PREVIEW_TAKE = 5;
const PANEL_TAKE = 30;

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelative(dateIso: string): string {
  const diffMs = new Date(dateIso).getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  if (Math.abs(diffMin) < 60) return relativeTime.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return relativeTime.format(diffHour, "hour");
  return relativeTime.format(Math.round(diffHour / 24), "day");
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Today/Yesterday/Earlier, in that fixed order — an empty group is
 *  dropped rather than shown as a header with nothing under it. */
function groupByDay(notifications: NotificationRow[]): { label: string; items: NotificationRow[] }[] {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const today: NotificationRow[] = [];
  const yest: NotificationRow[] = [];
  const earlier: NotificationRow[] = [];
  for (const n of notifications) {
    const createdAt = new Date(n.createdAt);
    if (isSameLocalDay(createdAt, now)) today.push(n);
    else if (isSameLocalDay(createdAt, yesterday)) yest.push(n);
    else earlier.push(n);
  }

  return [
    { label: "Today", items: today },
    { label: "Yesterday", items: yest },
    { label: "Earlier", items: earlier },
  ].filter((group) => group.items.length > 0);
}

export function NotificationBell({ initialUnreadCount = 0 }: { initialUnreadCount?: number }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [markingAll, setMarkingAll] = useState(false);
  // document.body doesn't exist during SSR — the portal only mounts once
  // this effect confirms we're in the browser, same render-after-mount
  // guard any portal-to-body needs.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-time post-mount flag to gate the portal target (document.body), not a data-fetch/subscription effect
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const take = open ? PANEL_TAKE : PREVIEW_TAKE;

    async function poll() {
      // A transient network blip (offline, a dev-server restart, the tab
      // waking from sleep) shouldn't crash this background poll — any
      // unguarded fetch failure becomes an unhandled rejection, which
      // Next's dev overlay surfaces as a hard crash for what's really
      // just "skip this tick, try again in 5s".
      try {
        const res = await fetch(`/api/notifications?take=${take}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      } catch {
        // Ignored — the next interval tick retries.
      }
    }
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open]);

  // The backdrop dims the page but doesn't stop wheel/touch scroll from
  // passing through to it — without this, scrolling while the panel is
  // open moves the page behind it, undercutting the point of a panel
  // that's supposed to keep you on the current page.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function markRead(id: string) {
    setUnreadCount((count) => Math.max(0, count - 1));
    setNotifications((rows) => rows.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
  }

  async function markAllRead() {
    setMarkingAll(true);
    setUnreadCount(0);
    setNotifications((rows) => rows.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    await fetch("/api/notifications/read-all", { method: "POST" });
    setMarkingAll(false);
  }

  function closeAndMark(n: NotificationRow) {
    if (!n.readAt) markRead(n.id);
    setOpen(false);
  }

  const groups = groupByDay(notifications);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-expanded={open}
        className="btn-icon relative"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-live px-1 text-[10px] leading-none font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
                <motion.div
                  key="notifications-backdrop"
                  className="fixed inset-0 z-40 bg-black/60"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  onClick={() => setOpen(false)}
                />
                <motion.div
                  key="notifications-panel"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Notifications"
                  className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-surface sm:w-[400px]"
                  style={{ boxShadow: "0 16px 40px rgba(0, 0, 0, 0.45)" }}
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
                    <h2 className="text-base font-semibold">Notifications</h2>
                    <div className="flex items-center gap-3">
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={markAllRead}
                          disabled={markingAll}
                          className="text-xs font-medium text-accent-blue hover:underline disabled:opacity-50"
                        >
                          {markingAll ? "Marking…" : "Mark all read"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        aria-label="Close notifications"
                        className="btn-icon"
                      >
                        <X size={18} className="text-muted" />
                      </button>
                    </div>
                  </div>

                  <div className="scrollbar-hide flex-1 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="p-8 text-center text-sm text-muted">You&apos;re all caught up.</p>
                    ) : (
                      groups.map((group) => (
                        <div key={group.label}>
                          <p className="px-5 pt-4 pb-1.5 text-xs font-semibold tracking-wide text-muted-strong uppercase">
                            {group.label}
                          </p>
                          {group.items.map((n) => {
                            const category = getNotificationCategory(n.type);
                            const Icon = category.Icon;
                            const unread = !n.readAt;
                            return (
                              <Link
                                key={n.id}
                                href={n.href}
                                onClick={() => closeAndMark(n)}
                                className={`flex items-start gap-3 px-5 py-3 transition hover:bg-surface-elevated ${
                                  unread ? "bg-accent-blue-soft/40" : ""
                                }`}
                              >
                                <span
                                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${NOTIFICATION_ICON_CLASS_NAME}`}
                                >
                                  <Icon size={16} />
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                  <span className="flex items-center gap-2">
                                    <span className={`text-sm font-medium ${unread ? "text-foreground" : "text-muted"}`}>
                                      {category.label}
                                    </span>
                                    {unread && (
                                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-blue" aria-hidden />
                                    )}
                                  </span>
                                  <span className={`text-sm ${unread ? "text-foreground" : "text-muted"}`}>{n.message}</span>
                                  <span className="text-metadata">{formatRelative(n.createdAt)}</span>
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>

                  <Link
                    href="/notifications"
                    onClick={() => setOpen(false)}
                    className="block border-t border-border px-5 py-3 text-center text-sm font-medium text-accent-blue hover:underline"
                  >
                    View all
                  </Link>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
