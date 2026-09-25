/**
 * Circuit — one notification row, shared by the bell's popover/sheet
 * (NotificationBell.tsx) and the full /notifications inbox so the two
 * never drift apart. No hooks: renders from a server page or a client
 * component alike.
 *
 * Unread is carried by the icon chip (inverted, volt glyph) and a volt
 * edge rather than a tinted row background — a tinted list of rows is
 * the first thing that made the old panel read as a stock template.
 */

import Link from "next/link";
import { getNotificationCategory } from "@/lib/notification-icon";

export type NotificationRow = {
  id: string;
  type: string;
  message: string;
  href: string;
  readAt: string | Date | null;
  createdAt: string | Date;
};

/** "now", "12m", "3h", "4d", then a short date — compact, mono, like a feed timestamp. */
export function formatShortAge(value: string | Date): string {
  const date = new Date(value);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Today / Yesterday / This week / Earlier, in that order — empty groups dropped. */
export function groupNotificationsByDay<T extends { createdAt: string | Date }>(rows: T[]): { label: string; items: T[] }[] {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);

  const groups: Record<string, T[]> = { Today: [], Yesterday: [], "This week": [], Earlier: [] };
  for (const row of rows) {
    const createdAt = new Date(row.createdAt);
    if (isSameLocalDay(createdAt, now)) groups.Today.push(row);
    else if (isSameLocalDay(createdAt, yesterday)) groups.Yesterday.push(row);
    else if (createdAt > weekAgo) groups["This week"].push(row);
    else groups.Earlier.push(row);
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

export function NotificationGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 px-4 pt-4 pb-1.5 font-mono text-[10px] font-semibold tracking-[0.16em] text-muted-strong uppercase sm:px-5">
      {children}
      <span className="h-px flex-1 bg-border" aria-hidden />
    </p>
  );
}

export function NotificationItem({ notification: n, onClick }: { notification: NotificationRow; onClick?: () => void }) {
  const { Icon, label } = getNotificationCategory(n.type);
  const unread = !n.readAt;

  return (
    <Link
      href={n.href}
      onClick={onClick}
      className="group relative flex items-start gap-3 px-4 py-3 transition-colors duration-[var(--duration-fast)] hover:bg-surface-elevated/70 sm:px-5"
    >
      {unread && <span aria-hidden className="absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full bg-accent-volt" />}
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${
          unread ? "bg-[#111318] text-accent-volt dark:bg-accent-volt-soft" : "bg-surface-elevated text-muted"
        }`}
      >
        <Icon size={16} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`line-clamp-2 text-[13.5px] leading-snug ${unread ? "font-medium text-foreground" : "text-muted"}`}>
          {n.message}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-muted-strong uppercase">
          {label}
          <span aria-hidden>·</span>
          <time dateTime={new Date(n.createdAt).toISOString()}>{formatShortAge(n.createdAt)}</time>
        </span>
      </span>
    </Link>
  );
}
