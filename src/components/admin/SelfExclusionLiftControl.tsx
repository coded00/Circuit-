"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatSelfExclusionDate } from "@/lib/selfExclusion";

/**
 * Circuit — staff-side early lift of a player's cool-off from staked Battles.
 *
 * The counterpart of the player's own control, and the only way one ends
 * early (`POST /api/account/self-exclusion` can extend and nothing else).
 * Renders nothing at all for a player with no cool-off in force, so the admin
 * user page's action row stays as short as it was for the usual case — which
 * is nearly every player. The server still re-checks; this only decides
 * whether to draw the button.
 *
 * A reason is asked for because the lift is recorded with one. It isn't
 * required: refusing to end a cool-off for a player who is asking, because
 * staff can't articulate why, would be the wrong trade.
 */
export function SelfExclusionLiftControl({ userId, selfExcludedUntil }: { userId: string; selfExcludedUntil: string | null }) {
  const router = useRouter();
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const until = selfExcludedUntil ? new Date(selfExcludedUntil) : null;

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/admin/users/${userId}/self-exclusion`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      return;
    }
    setShowReasonInput(false);
    router.refresh();
  }

  if (!until) return null;

  if (showReasonInput) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted">
          Ends their cool-off now instead of {formatSelfExclusionDate(until)}. They can set a new one themselves at any time.
        </p>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (recorded, not shown to the user)"
          className="field-input text-xs"
        />
        {error && <p className="field-error">{error}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={submitting} onClick={() => submit()} className="btn-danger text-xs">
            {submitting ? "Lifting…" : "Confirm lift"}
          </button>
          <button type="button" onClick={() => setShowReasonInput(false)} className="btn-ghost text-xs">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setShowReasonInput(true)} className="btn-secondary text-xs">
      Lift staking cool-off
    </button>
  );
}
