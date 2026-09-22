"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";

type Announcement = { id: string; title: string; body: string; enabled: boolean; createdAt: string };

function AnnouncementForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-title`} className="field-label">Title</label>
        <input id={`${uid}-title`} required value={title} onChange={(e) => setTitle(e.target.value)} className="field-input" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-body`} className="field-label">Body</label>
        <textarea id={`${uid}-body`} required rows={2} value={body} onChange={(e) => setBody(e.target.value)} className="field-textarea" />
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className="btn-primary text-sm">
          {submitting ? "Publishing…" : "Publish announcement"}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AnnouncementList({ announcements }: { announcements: Announcement[] }) {
  const router = useRouter();
  const confirmDialog = useConfirmDialog();
  const [creating, setCreating] = useState(false);

  async function toggle(id: string, enabled: boolean) {
    await fetch(`/api/admin/announcements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    router.refresh();
  }

  async function remove(id: string, title: string) {
    if (!(await confirmDialog({ title: `Delete "${title}"?`, confirmLabel: "Delete" }))) return;
    await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      {announcements.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">No announcements yet.</p>
      ) : (
        announcements.map((a, i) => (
          <div key={a.id} className={`flex items-center gap-3 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">{a.title}</span>
              <span className="truncate text-xs text-muted">{a.body}</span>
            </div>
            <span className={`badge ${a.enabled ? "badge-open" : "badge-neutral"}`}>{a.enabled ? "Live" : "Off"}</span>
            <button type="button" onClick={() => toggle(a.id, !a.enabled)} className="btn-ghost px-3 py-1.5 text-xs">
              {a.enabled ? "Turn off" : "Turn on"}
            </button>
            <button type="button" onClick={() => remove(a.id, a.title)} aria-label="Delete" className="text-danger hover:opacity-70">
              <Trash2 size={15} />
            </button>
          </div>
        ))
      )}

      {creating ? (
        <AnnouncementForm onDone={() => setCreating(false)} />
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="btn-secondary mt-2 w-fit text-sm">
          + New announcement
        </button>
      )}
    </div>
  );
}
