"use client";

/**
 * Circuit — notification bell. Its own setInterval + fetch, not a
 * rendered <Poller/> — Poller's router.refresh() re-runs a whole Server
 * Component page, the wrong mechanism for a header-mounted badge that
 * needs local client state instead.
 *
 * Desktop: a popover anchored under the bell (no page-dimming backdrop —
 * glancing at notifications shouldn't black out the page you're on).
 * Phones: a bottom sheet via ui/Overlay.tsx's DialogOverlay. Both render
 * the same NotificationInbox body; rows come from
 * notifications/NotificationItem.tsx, shared with /notifications.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Bell, BellOff, CheckCheck } from "lucide-react";
import { DialogOverlay, useIsDesktop } from "@/components/ui/Overlay";
import {
  NotificationGroupLabel,
  NotificationItem,
  groupNotificationsByDay,
  type NotificationRow,
} from "@/components/notifications/NotificationItem";

const POLL_INTERVAL_MS = 5000;
const PREVIEW_TAKE = 5;
const PANEL_TAKE = 30;

type Filter = "all" | "unread";

function NotificationInbox({
  notifications,
  unreadCount,
  markingAll,
  onMarkAll,
  onItemClick,
  onClose,
}: {
  notifications: NotificationRow[];
  unreadCount: number;
  markingAll: boolean;
  onMarkAll: () => void;
  onItemClick: (n: NotificationRow) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = filter === "unread" ? notifications.filter((n) => !n.readAt) : notifications;
  const groups = groupNotificationsByDay(visible);

  return (
    <>
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 pt-2 pb-0 sm:px-5 sm:pt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display flex items-center gap-2 text-[17px] font-bold tracking-tight">
            Notifications
            {unreadCount > 0 && (
              <span className="rounded-full bg-accent-volt px-1.5 py-0.5 font-mono text-[10px] leading-none font-bold text-accent-volt-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </h2>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAll}
              disabled={markingAll}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted transition hover:bg-surface-elevated hover:text-foreground disabled:opacity-50"
            >
              <CheckCheck size={14} />
              {markingAll ? "Marking…" : "Mark all read"}
            </button>
          )}
        </div>
        <div className="-mb-px flex gap-4" role="tablist">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`border-b-2 pb-2.5 text-[13px] font-semibold capitalize transition-colors ${
                filter === f ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {f}
              {f === "unread" && unreadCount > 0 && <span className="ml-1 text-muted-strong">{unreadCount}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto pb-2">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-8 py-14 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-surface-elevated text-muted">
              <BellOff size={20} />
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">{filter === "unread" ? "Nothing unread" : "No notifications yet"}</p>
              <p className="text-xs leading-relaxed text-muted">
                Match calls, results, disputes and invites will show up here.
              </p>
            </div>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <NotificationGroupLabel>{group.label}</NotificationGroupLabel>
              {group.items.map((n) => (
                <NotificationItem key={n.id} notification={n} onClick={() => onItemClick(n)} />
              ))}
            </div>
          ))
        )}
      </div>

      <Link
        href="/notifications"
        onClick={onClose}
        className="group flex shrink-0 items-center justify-between border-t border-border px-4 py-3 text-[13px] font-semibold transition hover:bg-surface-elevated/70 sm:px-5"
      >
        See all notifications
        <ArrowRight size={14} className="text-muted transition-transform group-hover:translate-x-0.5" />
      </Link>
    </>
  );
}

export function NotificationBell({ initialUnreadCount = 0 }: { initialUnreadCount?: number }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [markingAll, setMarkingAll] = useState(false);
  const isDesktop = useIsDesktop();
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  // Desktop popover: click-outside and Escape close it. (The phone sheet
  // gets both from DialogOverlay.)
  useEffect(() => {
    if (!open || !isDesktop) return;
    function onPointerDown(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, isDesktop]);

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

  const inbox = (
    <NotificationInbox
      notifications={notifications}
      unreadCount={unreadCount}
      markingAll={markingAll}
      onMarkAll={markAllRead}
      onItemClick={closeAndMark}
      onClose={() => setOpen(false)}
    />
  );

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        className={`btn-icon relative ${open ? "bg-surface-elevated text-foreground" : ""}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-live px-1 font-mono text-[10px] leading-none font-bold text-white ring-2 ring-background">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isDesktop ? (
        <AnimatePresence>
          {open && (
            <motion.div
              role="dialog"
              aria-label="Notifications"
              className="absolute top-full right-0 z-40 mt-2 flex max-h-[min(560px,calc(100vh-88px))] w-[400px] max-w-[calc(100vw-2rem)] origin-top-right flex-col overflow-hidden rounded-[14px] border border-border bg-surface"
              style={{ boxShadow: "var(--shadow-float)" }}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {inbox}
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <DialogOverlay open={open} onClose={() => setOpen(false)} label="Notifications">
          <div className="flex h-[78vh] flex-col">{inbox}</div>
        </DialogOverlay>
      )}
    </div>
  );
}
