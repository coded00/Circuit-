"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Circuit — admin fund freeze control (V1 audit's "admin control over
 * funds" requirement). Same reason-prompting toggle shape as
 * SuspendControl.tsx — freezing needs a reason (shown back here and
 * logged to AuditLogEntry), unfreezing doesn't need one.
 */
export function FreezeFundsControl({
  tournamentId,
  fundsFrozen,
  freezeReason,
}: {
  tournamentId: string;
  fundsFrozen: boolean;
  freezeReason: string | null;
}) {
  const router = useRouter();
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function freeze() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/freeze-funds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setShowReasonInput(false);
    router.refresh();
  }

  async function unfreeze() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/freeze-funds`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    router.refresh();
  }

  if (fundsFrozen) {
    return (
      <div className="flex flex-col gap-2">
        {freezeReason && <p className="text-xs text-muted">Reason: {freezeReason}</p>}
        {error && <p className="field-error">{error}</p>}
        <button type="button" disabled={submitting} onClick={unfreeze} className="btn-secondary text-xs">
          {submitting ? "Unfreezing…" : "Unfreeze funds"}
        </button>
      </div>
    );
  }

  if (showReasonInput) {
    return (
      <div className="flex flex-col gap-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for freezing funds"
          className="field-input text-xs"
        />
        {error && <p className="field-error">{error}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={submitting} onClick={freeze} className="btn-danger text-xs">
            {submitting ? "Freezing…" : "Confirm freeze"}
          </button>
          <button type="button" onClick={() => setShowReasonInput(false)} className="btn-ghost text-xs">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setShowReasonInput(true)} className="btn-danger text-xs">
      Freeze funds
    </button>
  );
}
