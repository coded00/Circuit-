/**
 * Circuit — full notification inbox. The bell (src/components/
 * NotificationBell.tsx) is a shallow preview; this is the paginated,
 * everything-you've-missed surface it links to. Rows are the same
 * NotificationItem the bell uses. `?filter=unread` narrows the list,
 * server-side, the same way the API's own `unread=true` does.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BellOff } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { formatNotification } from "@/lib/notification-format";
import {
  NotificationGroupLabel,
  NotificationItem,
  groupNotificationsByDay,
} from "@/components/notifications/NotificationItem";
import MarkAllReadButton from "./MarkAllReadButton";
import LoadMoreNotifications from "./LoadMoreNotifications";

// Private, per-user inbox — never real public content.
export const metadata: Metadata = { robots: { index: false, follow: false } };

const PAGE_SIZE = 20;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/notifications");
  }
  const unreadOnly = (await searchParams).filter === "unread";

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const items = page.map((n) => ({ id: n.id, type: n.type, readAt: n.readAt, createdAt: n.createdAt, ...formatNotification(n.type, n.payload) }));
  const groups = groupNotificationsByDay(items);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6 sm:p-8">
      <header className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-[28px]">Notifications</h1>
          <p className="text-sm text-muted">
            {unreadCount > 0 ? (
              <>
                <span className="font-semibold text-foreground">{unreadCount}</span> unread
              </>
            ) : (
              "You're all caught up."
            )}
          </p>
        </div>
        {unreadCount > 0 && <MarkAllReadButton />}
      </header>

      <nav className="flex gap-5 border-b border-border" aria-label="Filter notifications">
        {[
          { label: "All", href: "/notifications", active: !unreadOnly },
          { label: "Unread", href: "/notifications?filter=unread", active: unreadOnly, count: unreadCount },
        ].map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
              tab.active ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
            {!!tab.count && <span className="ml-1.5 font-mono text-xs text-muted-strong">{tab.count}</span>}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[15px] border border-dashed border-border-strong px-8 py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-surface-elevated text-muted">
            <BellOff size={20} />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold">{unreadOnly ? "Nothing unread" : "No notifications yet"}</p>
            <p className="max-w-xs text-xs leading-relaxed text-muted">
              Match calls, results, disputes and team invites will land here as they happen.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[15px] border border-border bg-surface pb-2">
          {groups.map((group) => (
            <section key={group.label}>
              <NotificationGroupLabel>{group.label}</NotificationGroupLabel>
              {group.items.map((n) => (
                <NotificationItem key={n.id} notification={n} />
              ))}
            </section>
          ))}
          <LoadMoreNotifications initialCursor={nextCursor} unreadOnly={unreadOnly} />
        </div>
      )}
    </div>
  );
}
