"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Circuit — staked Battles, and the two per-account limits that bound them.
 *
 * The switch is a kill switch: turning it off stops anyone locking a NEW
 * stake — including accepting a Battle or Quick Match that is already open —
 * while anything already staked still settles or expires and refunds
 * normally. It drains the feature rather than freezing money inside it.
 *
 * The limits are per account, not per Battle, and are the control the
 * per-Battle cap cannot express: how much one account can have at risk at
 * once, and how much it can put through in a day.
 *
 * All three are also enforced in `lockStake` (src/lib/stakes.ts), which is
 * the only place a stake is locked — this page is a way to change them, not
 * the thing that makes them true.
 */
export function StakedBattlesControl({
  enabled,
  maxLockedKobo,
  maxDailyKobo,
  canEdit,
}: {
  enabled: boolean;
  maxLockedKobo: number;
  maxDailyKobo: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [locked, setLocked] = useState(String(Math.round(maxLockedKobo / 100)));
  const [daily, setDaily] = useState(String(Math.round(maxDailyKobo / 100)));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(body: Record<string, unknown>) {
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
      setError(data?.error ?? "Something went wrong.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  function saveLimits() {
    const lockedNaira = Number(locked);
    const dailyNaira = Number(daily);
    if (!Number.isInteger(lockedNaira) || lockedNaira < 0 || !Number.isInteger(dailyNaira) || dailyNaira < 0) {
      setError("Enter both limits as whole naira, 0 or more.");
      return;
    }
    void save({ maxLockedStakeKobo: lockedNaira * 100, maxDailyStakeKobo: dailyNaira * 100 });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Staked Battles</p>
          <p className="text-xs text-muted">
            {enabled
              ? "Players can put money on a Battle. Turning this off stops new stakes immediately; Battles already open still settle or refund."
              : "Staking is off. Nobody can lock a new stake — Battles already open still settle or refund normally."}
          </p>
        </div>
        <button
          type="button"
          disabled={!canEdit || submitting}
          onClick={() => save({ stakedBattlesEnabled: !enabled })}
          className={enabled ? "btn-secondary text-xs" : "btn-primary text-xs"}
        >
          {enabled ? "Turn staking off" : "Turn staking on"}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Most one account can have staked at once (₦)
          <input value={locked} onChange={(e) => setLocked(e.target.value)} inputMode="numeric" disabled={!canEdit} className="field-input w-40" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Most one account can stake in 24 hours (₦)
          <input value={daily} onChange={(e) => setDaily(e.target.value)} inputMode="numeric" disabled={!canEdit} className="field-input w-40" />
        </label>
        {canEdit && (
          <button type="button" disabled={submitting} onClick={saveLimits} className="btn-secondary text-xs">
            Save limits
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        Limits are per player, across every open Battle and pending Quick Match together. The 24-hour figure counts stakes
        even after they settle or are refunded, so it can&apos;t be reset by cancelling. Zero stops staking as effectively as
        the switch above, without hiding the feature.
      </p>
      {saved && !error && <p className="text-xs text-muted">Saved.</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
