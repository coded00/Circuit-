"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Circuit — the platform fee rate, admin-editable rather than a code
 * constant (see PlatformSetting.platformFeeBps's own schema comment).
 * Shown/edited as a plain percent (e.g. "5.00"); converted to/from
 * basis points at the API boundary.
 */
export function PlatformFeeControl({ platformFeeBps, canEdit }: { platformFeeBps: number; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [percent, setPercent] = useState((platformFeeBps / 100).toString());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsed = Number(percent);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setError("Enter a percentage between 0 and 100.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platformFeeBps: Math.round(parsed * 100) }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            aria-label="Platform fee percentage"
            className="field-input w-24 text-sm"
          />
          <span className="text-sm text-muted">%</span>
        </div>
        {error && <p className="field-error">{error}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={submitting} onClick={save} className="btn-primary text-sm">
            {submitting ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setPercent((platformFeeBps / 100).toString());
              setError(null);
            }}
            className="btn-ghost text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">Platform fee</span>
        <span className="text-xs text-muted">
          {(platformFeeBps / 100).toFixed(2)}% of every paid entry, carved out at confirmation — the player&apos;s
          own checkout amount never changes.
        </span>
      </div>
      {canEdit && (
        <button type="button" onClick={() => setEditing(true)} className="btn-secondary text-sm">
          Edit
        </button>
      )}
    </div>
  );
}
