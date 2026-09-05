"use client";

import { useState } from "react";

type NotificationRow = { id: string; message: string; href: string; readAt: string | null; createdAt: string };

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function formatRelative(dateIso: string): string {
  const diffMin = Math.round((new Date(dateIso).getTime() - Date.now()) / 60000);
  if (Math.abs(diffMin) < 60) return relativeTime.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return relativeTime.format(diffHour, "hour");
  return relativeTime.format(Math.round(diffHour / 24), "day");
}

export default function LoadMoreNotifications({ initialCursor }: { initialCursor: string | null }) {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    const res = await fetch(`/api/notifications?cursor=${cursor}`);
    if (res.ok) {
      const data = await res.json();
      setRows((prev) => [...prev, ...data.notifications]);
      setCursor(data.nextCursor);
    }
    setLoading(false);
  }

  return (
    <>
      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((n) => (
            <a key={n.id} href={n.href} className="card-row flex items-start justify-between gap-3 p-4">
              <span className={n.readAt ? "text-muted" : ""}>{n.message}</span>
              <span className="shrink-0 text-xs text-muted">{formatRelative(n.createdAt)}</span>
            </a>
          ))}
        </div>
      )}
      {cursor && (
        <button type="button" onClick={loadMore} disabled={loading} className="btn-secondary w-fit self-center">
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </>
  );
}
