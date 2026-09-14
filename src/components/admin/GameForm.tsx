"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

type Game = {
  id: string;
  name: string;
  iconUrl: string | null;
};

/**
 * Circuit — create/edit form for a `Game` catalog row. `iconUrl` is a
 * pasted URL, not a file upload — same convention as `BannerForm.imageUrl`
 * (no upload/object-storage pipeline anywhere in Circuit).
 */
export function GameForm({ game, onDone }: { game?: Game; onDone: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(game?.name ?? "");
  const [iconUrl, setIconUrl] = useState(game?.iconUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const body = { name, iconUrl: iconUrl || null };

    const res = await fetch(game ? `/api/admin/games/${game.id}` : "/api/admin/games", {
      method: game ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-name`} className="field-label">Name</label>
          <input
            id={`${uid}-name`}
            required
            placeholder="e.g. EA FC 26"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field-input"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-icon`} className="field-label">Icon URL (optional)</label>
          <input
            id={`${uid}-icon`}
            type="url"
            placeholder="https://…"
            value={iconUrl}
            onChange={(e) => setIconUrl(e.target.value)}
            className="field-input"
          />
        </div>
      </div>

      {error && <p className="field-error">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className="btn-primary text-sm">
          {submitting ? "Saving…" : game ? "Save changes" : "Add game"}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
