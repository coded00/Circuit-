"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Circuit — the one real write action on the admin user detail page.
 * `User.isSuspended`/`suspensionReason` already existed in the schema
 * for exactly this (P6-4/TRU-4); this is just the first UI that can set
 * them without a direct DB write.
 */
export function SuspendControl({
  userId,
  isSuspended,
  suspensionReason,
}: {
  userId: string;
  isSuspended: boolean;
  suspensionReason: string | null;
}) {
  const router = useRouter();
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(nextSuspended: boolean, nextReason?: string) {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSuspended: nextSuspended, reason: nextReason }),
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

  if (isSuspended) {
    return (
      <div className="flex flex-col gap-2">
        {suspensionReason && <p className="text-xs text-muted">Reason: {suspensionReason}</p>}
        {error && <p className="field-error">{error}</p>}
        <button type="button" disabled={submitting} onClick={() => submit(false)} className="btn-secondary text-xs">
          {submitting ? "Unsuspending…" : "Unsuspend account"}
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
          placeholder="Reason (shown to the user)"
          className="field-input text-xs"
        />
        {error && <p className="field-error">{error}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={submitting} onClick={() => submit(true, reason)} className="btn-danger text-xs">
            {submitting ? "Suspending…" : "Confirm suspend"}
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
      Suspend account
    </button>
  );
}
