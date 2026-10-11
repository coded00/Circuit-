"use client";

import { useState } from "react";
import { NotificationGroupLabel, NotificationItem, type NotificationRow } from "@/components/notifications/NotificationItem";

export default function LoadMoreNotifications({ initialCursor, unreadOnly }: { initialCursor: string | null; unreadOnly: boolean }) {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    const res = await fetch(`/api/notifications?cursor=${cursor}${unreadOnly ? "&unread=true" : ""}`);
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
        <section>
          <NotificationGroupLabel>Older</NotificationGroupLabel>
          {rows.map((n) => (
            <NotificationItem key={n.id} notification={n} />
          ))}
        </section>
      )}
      {cursor && (
        <div className="border-t border-border px-4 pt-3 pb-1 sm:px-5">
          <button type="button" onClick={loadMore} disabled={loading} className="btn-ghost w-full py-2 text-[13px]">
            {loading ? "Loading…" : "Load older notifications"}
          </button>
        </div>
      )}
    </>
  );
}
