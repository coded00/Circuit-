"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Circuit — closing a repeated-pair flag from /admin/stakes.
 *
 * Two answers, because there are only two: nothing here (DISMISSED), or
 * something was done (ACTIONED). Acting requires a note — the suspension or
 * the conversation itself happens elsewhere and this row is what the next
 * person to see this pair will read, so a closed-as-actioned flag with
 * nothing written on it is worse than leaving it open.
 *
 * Dismissing asks for nothing. Most flags will be two friends who play each
 * other constantly, and a queue that demands a paragraph before it will let
 * you clear an innocent pair is a queue that stops getting cleared.
 */
export default function StakePatternReview({ flagId }: { flagId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close(status: "DISMISSED" | "ACTIONED") {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/admin/stakes/${flagId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note: note.trim() || undefined }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="What did you find? (required to mark actioned, optional to dismiss)"
        className="field-textarea"
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => close("DISMISSED")} disabled={submitting} className="btn-ghost">
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => close("ACTIONED")}
          disabled={submitting || !note.trim()}
          className="btn-secondary"
        >
          Mark actioned
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
