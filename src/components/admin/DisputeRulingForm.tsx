"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Circuit — a staff member's ruling on one dispute: uphold it (the submission goes back to review) or dismiss it, in writing. */
export function DisputeRulingForm({ disputeId }: { disputeId: string }) {
  const router = useRouter();
  const [ruling, setRuling] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rule(outcome: "UPHELD" | "DISMISSED") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/daily-challenges/disputes/${disputeId}/rule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome, ruling }) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <label htmlFor={`ruling-${disputeId}`} className="field-label">
        Ruling (the player is told)
      </label>
      <textarea id={`ruling-${disputeId}`} rows={2} value={ruling} onChange={(e) => setRuling(e.target.value)} className="field-input" />
      {error && <p className="field-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || ruling.trim().length < 5} onClick={() => rule("UPHELD")} className="btn-primary">
          Uphold — send back to review
        </button>
        <button type="button" disabled={busy || ruling.trim().length < 5} onClick={() => rule("DISMISSED")} className="btn-secondary">
          Dismiss — the decision stands
        </button>
      </div>
    </div>
  );
}
