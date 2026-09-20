"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Circuit — the organizer-revenue settlement window, admin-editable
 * rather than a code constant (see PlatformSetting.
 * organizerRevenueSettlementHours's own schema comment). Read fresh by
 * the sweep, not snapshotted per tournament — changing it shifts every
 * still-PENDING tournament's settle point, not just new ones.
 */
export function OrganizerRevenueSettlementControl({
  hours,
  canEdit,
}: {
  hours: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(hours.toString());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 720) {
      setError("Enter a whole number of hours between 0 and 720 (30 days).");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizerRevenueSettlementHours: parsed }),
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
            max={720}
            step="1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Organizer revenue settlement window in hours"
            className="field-input w-24 text-sm"
          />
          <span className="text-sm text-muted">hours</span>
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
              setValue(hours.toString());
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
        <span className="text-sm font-semibold">Organizer revenue settlement window</span>
        <span className="text-xs text-muted">
          {hours} hour{hours === 1 ? "" : "s"} after a tournament completes before its organizer revenue credits to
          their wallet — held longer if a dispute is open or funds are frozen.
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
