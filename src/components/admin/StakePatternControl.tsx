"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Circuit — the repeated-pair collusion sweep's four thresholds
 * (src/lib/stakePatterns.ts).
 *
 * These decide who lands in the /admin/stakes queue. They are settings
 * rather than code constants because the right numbers depend on how much
 * honest traffic pairs of friends generate here, and because a detection
 * rule that can't be quietened the moment it turns out to be noisy is a rule
 * staff will start ignoring.
 *
 * The four read together, not separately: the lookback and the sample floor
 * decide how much history a pair needs, the win share decides what
 * "lopsided" means, and the net-transfer figure is a second rule that fires
 * on size alone. Lowering the floor or the share makes the queue busier;
 * raising the net figure makes it quieter. Nothing here changes what players
 * can do — the sweep only ever queues a pair for a person to look at.
 */
export function StakePatternControl({
  windowDays,
  minBattles,
  winShareBps,
  netAlertKobo,
  canEdit,
}: {
  windowDays: number;
  minBattles: number;
  winShareBps: number;
  netAlertKobo: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [days, setDays] = useState(String(windowDays));
  const [min, setMin] = useState(String(minBattles));
  // Basis points are the storage unit but a percent is the unit a person
  // thinks in, so the input is a percentage and this converts on save —
  // same reasoning as platformFeeBps's own control.
  const [sharePercent, setSharePercent] = useState(String(winShareBps / 100));
  const [net, setNet] = useState(String(Math.round(netAlertKobo / 100)));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    const daysValue = Number(days);
    const minValue = Number(min);
    const shareValue = Number(sharePercent);
    const netValue = Number(net);

    // Checked here as well as in the route so a typo answers immediately
    // rather than after a round trip — the route is still the authority.
    if (!Number.isInteger(daysValue) || daysValue < 0 || daysValue > 365) {
      setError("The lookback window must be a whole number of days between 0 and 365.");
      return;
    }
    if (!Number.isInteger(minValue) || minValue < 2 || minValue > 500) {
      setError("The minimum Battles must be a whole number between 2 and 500.");
      return;
    }
    if (!Number.isFinite(shareValue) || shareValue < 50 || shareValue > 100) {
      setError("The win share must be a percentage between 50 and 100.");
      return;
    }
    if (!Number.isInteger(netValue) || netValue < 0) {
      setError("The net-transfer threshold must be a whole number of naira, 0 or more.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stakePatternWindowDays: daysValue,
        stakePatternMinBattles: minValue,
        // Two decimal places of a percent is the finest the bps column can
        // hold; rounding rather than truncating so 87.5% doesn't become 87.49.
        stakePatternWinShareBps: Math.round(shareValue * 100),
        stakePatternNetAlertKobo: netValue * 100,
      }),
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

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium">Stake pattern alerts</p>
        <p className="text-xs text-muted">
          Two accounts repeatedly settling staked Battles one way is what a laundering path looks like from the platform&apos;s
          side. The sweep queues those pairs on <span className="text-foreground">Stakes</span> for a person to review — it never
          suspends anyone or holds any money.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Look back (days)
          <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" disabled={!canEdit} className="field-input w-28" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Fewest Battles to judge
          <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="numeric" disabled={!canEdit} className="field-input w-28" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          One side wins at least (%)
          <input value={sharePercent} onChange={(e) => setSharePercent(e.target.value)} inputMode="decimal" disabled={!canEdit} className="field-input w-28" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Or net moved between them (₦)
          <input value={net} onChange={(e) => setNet(e.target.value)} inputMode="numeric" disabled={!canEdit} className="field-input w-40" />
        </label>
        {canEdit && (
          <button type="button" disabled={submitting} onClick={save} className="btn-secondary text-xs">
            Save thresholds
          </button>
        )}
      </div>

      <p className="text-xs text-muted">
        A pair is queued when a side wins at least that share of a run of Battles that size <em>or</em> when the net between them
        passes the naira figure on its own, over the lookback window. The first catches a deliberate run of losses at amounts too
        small for the second to notice; the second catches a large two-way flow that never looks lopsided. Both are read fresh on
        every sweep, so a change re-measures every pair within two minutes — and lowering the Battles or the share will hand staff
        a queue with innocent rivals in it, because a 5-0 run between evenly matched players happens by chance about 6% of the time.
      </p>
      {saved && !error && <p className="text-xs text-muted">Saved.</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
