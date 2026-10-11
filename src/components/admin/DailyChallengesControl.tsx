"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/admin/ui-client";

/**
 * Circuit — the Daily Challenges kill switch and the two pilot ceilings.
 *
 * The switch is off until staff turn it on. Off means no new challenge can be published and nobody can enter
 * one; challenges already running keep running and can still be paused or cancelled. Turning it on is a
 * deliberate act (it puts entry fees and cash prizes in front of players), so it asks first.
 *
 * The ceilings bound the pilot: the most an entry can cost and the most players one challenge can hold. They
 * are checked when a challenge is saved, again when it is published, and again at entry, so tightening them
 * takes effect on challenges that were drafted under looser ones.
 */
export function DailyChallengesControl({
  enabled,
  maxFeeKobo,
  maxEntrants,
  maxPayoutBps,
  canEdit,
}: {
  enabled: boolean;
  maxFeeKobo: number;
  maxEntrants: number;
  /** The most prizes may add up to, as a share of the minimum field's entries, in basis points. */
  maxPayoutBps: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [fee, setFee] = useState(String(Math.round(maxFeeKobo / 100)));
  const [entrants, setEntrants] = useState(String(maxEntrants));
  const [payoutPct, setPayoutPct] = useState(String(maxPayoutBps / 100));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(body: Record<string, unknown>): Promise<string | null> {
    setSubmitting(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) {
      const message = data?.error ?? "Something went wrong.";
      setError(message);
      return message;
    }
    setSaved(true);
    router.refresh();
    return null;
  }

  function saveLimits() {
    const feeNaira = Number(fee);
    const count = Number(entrants);
    if (!Number.isInteger(feeNaira) || feeNaira < 0 || !Number.isInteger(count) || count < 1) {
      setError("Enter the fee limit as whole naira (0 or more) and the entrant limit as a whole number (1 or more).");
      return;
    }
    const pct = Number(payoutPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError("Enter the payout cap as a percentage from 0 to 100.");
      return;
    }
    void save({ maxChallengeEntryFeeKobo: feeNaira * 100, maxChallengeEntrants: count, maxChallengePayoutBps: Math.round(pct * 100) });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Daily Challenges</p>
          <p className="text-xs text-muted">
            {enabled
              ? "Challenges can be published and players can enter. Turning this off stops new publishing and new entries immediately; challenges already running keep running."
              : "Off. Staff can prepare drafts, but nothing can be published and nobody can enter."}
          </p>
        </div>
        {canEdit &&
          (enabled ? (
            <button type="button" disabled={submitting} onClick={() => save({ dailyChallengesEnabled: false })} className="btn-secondary text-xs">
              Turn off
            </button>
          ) : (
            <ConfirmButton
              label="Turn on"
              confirmLabel="Yes, turn on"
              tone="neutral"
              message="This lets staff publish challenges with entry fees and cash prizes. Only turn it on once the legal and payment-provider checks for paid competitions are done."
              onConfirm={() => save({ dailyChallengesEnabled: true })}
            />
          ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Highest entry fee (₦)
          <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="numeric" disabled={!canEdit} className="field-input w-40" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Most players in one challenge
          <input value={entrants} onChange={(e) => setEntrants(e.target.value)} inputMode="numeric" disabled={!canEdit} className="field-input w-40" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Prize payout cap (% of entries at the minimum field)
          <input value={payoutPct} onChange={(e) => setPayoutPct(e.target.value)} inputMode="decimal" disabled={!canEdit} className="field-input w-40" />
        </label>
        {canEdit && (
          <button type="button" disabled={submitting} onClick={saveLimits} className="btn-secondary text-xs">
            Save limits
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        Pilot ceilings. They apply when a challenge is saved, again when it is published and again at entry, so lowering them
        also stops challenges drafted under the old numbers. A fee limit of 0 keeps the pilot to free challenges.
      </p>
      {saved && !error && <p className="text-xs text-muted">Saved.</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
