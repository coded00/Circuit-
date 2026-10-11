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

import { feedback } from "@/lib/feedback";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Bell, BellOff, CheckCheck, X } from "lucide-react";
import {
  NotificationGroupLabel,
  NotificationItem,
  groupNotificationsByDay,
  type NotificationRow,
} from "@/components/notifications/NotificationItem";

const POLL_INTERVAL_MS = 15_000;
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
              <span className="cut-xs bg-accent-volt px-1.5 py-0.5 font-mono text-[11px] leading-none font-bold text-accent-volt-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAll}
                disabled={markingAll}
                className="flex items-center gap-1 rounded-none px-1.5 py-1 text-xs font-medium text-muted transition hover:bg-surface-elevated hover:text-foreground disabled:opacity-50"
              >
                <CheckCheck size={14} />
                {markingAll ? "Marking…" : "Mark all read"}
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Close notifications" className="btn-icon h-9 w-9">
              <X size={18} className="text-muted" />
            </button>
          </div>
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
            <span className="flex h-11 w-11 items-center justify-center cut-sm bg-surface-elevated text-muted">
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

export function NotificationBell({
  initialUnreadCount = 0,
  buttonClassName = "btn-icon",
}: {
  initialUnreadCount?: number;
  /** Trigger styling — the header's HUD strip passes its own compact segment style. */
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const lastUnread = useRef(initialUnreadCount);
  const [markingAll, setMarkingAll] = useState(false);
  // The panel is portaled to <body> so nothing in the header can clip it; that needs the client.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    let cancelled = false;
    const take = open ? PANEL_TAKE : PREVIEW_TAKE;

    async function poll() {
      // A hidden tab has nobody to notify; it catches up the moment it is visible again.
      if (document.visibilityState !== "visible") return;
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
        // A new notification since the last look: a short chime and buzz.
        if (data.unreadCount > lastUnread.current) feedback("alert");
        lastUnread.current = data.unreadCount;
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

  // While the panel is open: Escape closes it, and the page behind it doesn't scroll.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
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
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        className={`${buttonClassName} relative ${open ? "bg-surface-elevated text-foreground" : ""}`}
      >
        <Bell size={20} className={unreadCount > 0 ? "translate-y-0.5 -translate-x-0.5" : undefined} />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center cut-xs bg-live px-1 font-mono text-[9px] leading-none font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Slides in from the right over a dimmed page, on every screen size. */}
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
                  data-surface="dark"
                  className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-surface text-foreground sm:w-[420px]"
                  style={{ boxShadow: "-16px 0 40px rgba(0, 0, 0, 0.45)", paddingBottom: "env(safe-area-inset-bottom)" }}
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  {inbox}
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
