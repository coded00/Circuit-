"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

export function CalendarEventForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("COMMUNITY");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/admin/calendar-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, category, date: date ? new Date(date).toISOString() : null }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-title`} className="field-label">Event title</label>
          <input id={`${uid}-title`} required value={title} onChange={(e) => setTitle(e.target.value)} className="field-input" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-category`} className="field-label">Category</label>
          <select id={`${uid}-category`} value={category} onChange={(e) => setCategory(e.target.value)} className="field-select">
            <option value="COMMUNITY">Community</option>
            <option value="GAME_RELEASE">Game Release</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-date`} className="field-label">Date &amp; time</label>
          <input id={`${uid}-date`} required type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="field-input" />
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className="btn-primary text-sm">
          {submitting ? "Creating…" : "Create event"}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
