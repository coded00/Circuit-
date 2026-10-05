"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Circuit — staff approve (or withdraw approval of) a tournament's payout. Approving needs a deliberate
 * second click: it releases money.
 */
export function PayoutApprovalControl({ tournamentId, approved, blocked, canWithdraw }: { tournamentId: string; approved: boolean; blocked: boolean; canWithdraw: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "POST" | "DELETE") {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/payout-approval`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify({ note }) : undefined,
    });
    const data = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  if (approved) {
    return (
      <div className="flex flex-col gap-2">
        {error && <p className="field-error">{error}</p>}
        {canWithdraw && (
          <button type="button" disabled={submitting} onClick={() => send("DELETE")} className="btn-secondary text-xs">
            {submitting ? "Withdrawing…" : "Withdraw approval"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="field-error">{error}</p>}
      {!confirming ? (
        <button type="button" disabled={blocked} onClick={() => setConfirming(true)} className="btn-primary text-xs">
          Review and approve…
        </button>
      ) : (
        <>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (optional)" className="field-input" />
          <div className="flex gap-2">
            <button type="button" disabled={submitting} onClick={() => send("POST")} className="btn-primary text-xs">
              {submitting ? "Approving…" : "Confirm: release these payouts"}
            </button>
            <button type="button" disabled={submitting} onClick={() => setConfirming(false)} className="btn-secondary text-xs">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
