"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Circuit — "Cancel" action, shared by the admin Competitions list/detail
 * and the organizer's own dashboard tournament detail panel. Posts to the
 * real `/api/tournaments/[id]/cancel` route — its auth gate accepts both
 * the tournament's own organizer and staff, and its own guards (funds
 * frozen, past the cancellation lock, already cancelled/complete) are the
 * actual source of truth; the caller decides whether to render this
 * button at all based on the same `cancellable` condition the route
 * enforces, but a stale render still fails safely with the route's own
 * error message.
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
