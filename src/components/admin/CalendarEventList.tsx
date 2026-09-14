"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { CalendarEventForm } from "./CalendarEventForm";

type Event = { id: string; title: string; category: string; date: string; cancelled: boolean };

function categoryLabel(category: string): string {
  return category === "COMMUNITY" ? "Community" : "Game Release";
}

export function CalendarEventList({ events }: { events: Event[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function toggleCancelled(id: string, cancelled: boolean) {
    await fetch(`/api/admin/calendar-events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancelled }),
    });
    router.refresh();
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Delete "${title}"?`)) return;
    await fetch(`/api/admin/calendar-events/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      {events.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">No events yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Category</th>
                <th>Date</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium">{e.title}</td>
                  <td className="text-muted">{categoryLabel(e.category)}</td>
                  <td className="text-muted">{new Date(e.date).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td>
                    <span className={`badge ${e.cancelled ? "badge-cancelled" : "badge-open"}`}>{e.cancelled ? "Cancelled" : "Scheduled"}</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => toggleCancelled(e.id, !e.cancelled)} className="text-xs font-medium text-accent-blue hover:underline">
                        {e.cancelled ? "Restore" : "Cancel"}
                      </button>
                      <button type="button" onClick={() => remove(e.id, e.title)} aria-label="Delete" className="text-danger hover:opacity-70">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating ? (
        <CalendarEventForm onDone={() => setCreating(false)} />
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="btn-primary mt-2 w-fit text-sm">
          + Create Event
        </button>
      )}
    </div>
  );
}
