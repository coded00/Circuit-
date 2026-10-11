"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Circuit — whether completed tournaments are approved for payout automatically, and the largest payout that
 * is. Above the limit (or with a dispute, a flag or a funds freeze) a person still decides on the Payouts page.
 */
export function PayoutAutoApproveControl({ enabled, maxKobo, canEdit }: { enabled: boolean; maxKobo: number; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(String(Math.round(maxKobo / 100)));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(body: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  function saveLimit() {
    const naira = Number(value);
    if (!Number.isFinite(naira) || naira < 0) {
      setError("Enter an amount in naira, 0 or more.");
      return;
    }
    void save({ payoutAutoApproveMaxKobo: Math.round(naira * 100) });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Approve payouts automatically</p>
          <p className="text-xs text-muted">
            Once a tournament has finished and the settlement wait has passed, with no disputes, flags or freeze, its payout is approved without a click. Anything else waits for staff.
          </p>
        </div>
        <button type="button" disabled={!canEdit || submitting} onClick={() => save({ payoutAutoApprove: !enabled })} className={enabled ? "btn-secondary text-xs" : "btn-primary text-xs"}>
          {enabled ? "Turn off" : "Turn on"}
        </button>
      </div>
      {enabled && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Largest payout approved automatically (₦)
            <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" disabled={!canEdit} className="field-input w-40" />
          </label>
          {canEdit && (
            <button type="button" disabled={submitting} onClick={saveLimit} className="btn-secondary text-xs">
              Save limit
            </button>
          )}
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
