"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Circuit — disputing the decision on your own submission, while results are provisional. A different staff member reads
 * exactly what is written here, so it asks for a real reason; and it says what happens next, so nobody thinks it reverses
 * anything on its own.
 */
export function DisputeForm({ challengeId, minutesLeft }: { challengeId: string; minutesLeft: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/daily-challenges/${challengeId}/dispute`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary self-start text-sm">
          Dispute this decision
        </button>
        <span className="text-xs text-muted">You have about {Math.max(1, minutesLeft)} minute{minutesLeft === 1 ? "" : "s"} left to dispute.</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 border border-border-strong bg-surface-elevated p-3">
      <label htmlFor="dispute-reason" className="text-sm font-medium">
        Why do you disagree?
      </label>
      <textarea id="dispute-reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} className="field-input" placeholder="What the reviewer got wrong, and where in your evidence to look." />
      <p className="text-xs text-muted">A different staff member will review it. If they agree, your submission goes back for a fresh decision; nothing is paid until it is settled.</p>
      {error && <p className="field-error">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy || reason.trim().length < 10} onClick={send} className="btn-primary">
          {busy ? "Sending…" : "Send dispute"}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}
