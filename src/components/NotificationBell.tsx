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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-hover hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-cancelled px-1 font-mono text-[10px] font-semibold tabular-nums text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            <button type="button" onClick={markAllRead} className="text-xs font-medium text-brand hover:underline">
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
                  className="flex items-start gap-2 border-b border-border px-4 py-3 text-sm last:border-b-0 hover:bg-surface-hover"
                >
                  {!n.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
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
            className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-brand hover:underline"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
