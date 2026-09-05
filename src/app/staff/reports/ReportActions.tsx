"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReportActions({
  reportId,
  reportedUserId,
  alreadySuspended,
}: {
  reportId: string;
  reportedUserId: string;
  alreadySuspended: boolean;
}) {
  const router = useRouter();
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setReportStatus(status: string) {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/staff/reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    router.refresh();
  }

  async function confirmSuspend() {
    if (!reason.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/staff/users/${reportedUserId}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    await setReportStatus("ACTIONED");
  }

  async function unsuspend() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/staff/users/${reportedUserId}/unsuspend`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    router.refresh();
  }

  if (suspending) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          autoFocus
          placeholder="Suspension reason (shown to the affected user)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="field-input"
        />
        <div className="flex gap-2">
          <button onClick={confirmSuspend} disabled={submitting || !reason.trim()} className="btn-danger">
            Confirm suspend
          </button>
          <button onClick={() => setSuspending(false)} disabled={submitting} className="btn-secondary">
            Cancel
          </button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {alreadySuspended ? (
          <button onClick={unsuspend} disabled={submitting} className="btn-secondary">
            Unsuspend account
          </button>
        ) : (
          <button onClick={() => setSuspending(true)} disabled={submitting} className="btn-danger">
            Suspend account
          </button>
        )}
        <button onClick={() => setReportStatus("DISMISSED")} disabled={submitting} className="btn-secondary">
          Dismiss
        </button>
        <button onClick={() => setReportStatus("REVIEWED")} disabled={submitting} className="btn-secondary">
          Mark reviewed
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
