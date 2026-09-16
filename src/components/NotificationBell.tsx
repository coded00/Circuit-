"use client";

/**
 * Circuit — notification bell. Its own setInterval + fetch, not a
 * rendered <Poller/> — Poller's router.refresh() re-runs a whole Server
 * Component page, the wrong mechanism for a header-mounted badge that
 * needs local client state instead.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

type NotificationRow = {
  id: string;
  message: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

const POLL_INTERVAL_MS = 5000;
const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelative(dateIso: string): string {
  const diffMs = new Date(dateIso).getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  if (Math.abs(diffMin) < 60) return relativeTime.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return relativeTime.format(diffHour, "hour");
  return relativeTime.format(Math.round(diffHour / 24), "day");
}

export function NotificationBell({ initialUnreadCount = 0 }: { initialUnreadCount?: number }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const res = await fetch("/api/notifications?take=5");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    }
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function markRead(id: string) {
    setUnreadCount((count) => Math.max(0, count - 1));
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
  }

  async function markAllRead() {
    setUnreadCount(0);
    setNotifications((rows) => rows.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    await fetch("/api/notifications/read-all", { method: "POST" });
  }

  return (
    <div ref={containerRef} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Notifications" className="btn-icon relative">
        <Bell size={18} />
        {unreadCount > 0 && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-live" />}
      </button>

      {open && (
        // Below `sm` this trigger sits mid-header (not near the true right
        // edge — Create/Account still sit further right), so a right-0
        // anchor would clip off the left edge of a narrow phone. Below
        // `sm`, break out of the trigger anchor entirely and pin the panel
        // under the (fixed, 60px) header instead; `sm`+ has enough room
        // for the normal right-anchored dropdown.
        <div className="dropdown-panel fixed inset-x-4 top-[68px] z-20 origin-top sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-80 sm:origin-top-right">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            <button type="button" onClick={markAllRead} className="text-xs font-medium text-accent-blue hover:underline">
              Mark all read
            </button>
          </div>
          <div className="flex max-h-80 flex-col overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted">You&apos;re all caught up.</p>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => !n.readAt && markRead(n.id)}
                  className="flex items-start gap-2 border-b border-border px-4 py-3 text-sm last:border-b-0 hover:bg-surface-elevated"
                >
                  {!n.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-blue" />}
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className={n.readAt ? "text-muted" : ""}>{n.message}</span>
                    <span className="text-xs text-muted">{formatRelative(n.createdAt)}</span>
                  </span>
                </Link>
              ))
            )}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-accent-blue hover:underline"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
