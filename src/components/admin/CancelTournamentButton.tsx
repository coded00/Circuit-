"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Circuit — admin "Cancel" action on the Competitions list. Posts to the
 * same real `/api/tournaments/[id]/cancel` route the organizer's own
 * cancel flow already uses (refunds every paid registrant, notifies
 * every confirmed one) — its auth gate now also accepts staff, not just
 * the tournament's own organizer.
 */
export function CancelTournamentButton({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/cancel`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't cancel this tournament.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setConfirming(false);
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        {error && <span className="text-xs text-danger">{error}</span>}
        <button type="button" disabled={submitting} onClick={handleCancel} className="text-xs font-medium text-danger hover:underline">
          {submitting ? "Cancelling…" : "Confirm?"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="text-xs font-medium text-muted hover:underline">
          No
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setConfirming(true)} className="text-xs font-medium text-danger hover:underline">
      Cancel
    </button>
  );
}
