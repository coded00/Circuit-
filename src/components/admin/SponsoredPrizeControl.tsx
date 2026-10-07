"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Circuit — the ceiling on a sponsored prize (maxSponsoredPrizeKobo).
 *
 * An ordinary tournament's cash prize is paid from the entry fees it collects, so it can never be
 * worth more than they could raise (src/lib/prizePool.ts). A staff-run tournament is sponsored: the
 * prize comes out of Circuit's own balance, and the entry-fee cap does not apply to it. Until this
 * ceiling existed that exemption was unbounded, which is finding #3 of the security audit — a staff
 * organizer could declare any prize at all and have the platform's money paid to a confederate.
 *
 * This is deliberately generous, because a real flagship event is a real expense. It is a bound on a
 * mistyped or bad-faith declaration, not a judgement about what a tournament is worth. What actually
 * puts a second person in front of the money is the separation-of-duties rule in payoutApproval.ts —
 * no one can approve a payout for a tournament they organize, and nobody can approve their own prize.
 *
 * Zero means staff may not declare a cash prize at all. That is the kill switch, not a typo guard.
 */
export function SponsoredPrizeControl({ maxKobo, canEdit }: { maxKobo: number; canEdit: boolean }) {
  const router = useRouter();
  const [naira, setNaira] = useState(String(Math.round(maxKobo / 100)));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    const value = Number(naira);
    // Checked here as well as in the route so a typo answers immediately rather than after a round
    // trip — the route is still the authority.
    if (!Number.isInteger(value) || value < 0) {
      setError("The sponsored-prize ceiling must be a whole number of naira, 0 or more.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxSponsoredPrizeKobo: value * 100 }),
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
        <p className="text-sm font-medium">Sponsored prizes</p>
        <p className="text-xs text-muted">
          A tournament run by a staff member is sponsored: its prize is paid from Circuit&apos;s own balance instead of the
          entry fees, so it isn&apos;t capped by them. This is the ceiling on that.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Most a sponsored prize may be (₦)
          <input value={naira} onChange={(e) => setNaira(e.target.value)} inputMode="numeric" disabled={!canEdit} className="field-input w-40" />
        </label>
        {canEdit && (
          <button type="button" disabled={submitting} onClick={save} className="btn-secondary text-xs">
            Save ceiling
          </button>
        )}
      </div>

      <p className="text-xs text-muted">
        Checked both when a prize is declared and again before a payout is approved, so lowering this stops a prize that was
        already set. It bounds the declaration only — it is not what guards the money, because a payout above this still has
        to be approved by a staff member who neither organizes the tournament nor wins a prize in it. Set it to zero to stop
        staff declaring cash prizes at all.
      </p>
      {saved && !error && <p className="text-xs text-muted">Saved.</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
