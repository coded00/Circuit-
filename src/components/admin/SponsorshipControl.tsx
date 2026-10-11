"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Circuit — recording where a sponsored prize's money is coming from (TournamentSponsorship).
 *
 * Shown only for a payout that takes money from Circuit's own balance, which is the only case it applies
 * to. Until a record here covers that amount, the payout cannot be approved by anyone — so this is not a
 * note field, it is the thing standing between the prize and the money.
 *
 * Replacing an existing record is allowed right up until the payout is approved, and it is the same form:
 * a sponsorship that turns out to be for the wrong amount is corrected, not deleted, so the audit log keeps
 * both. Once the payout is approved the form goes away, because an approval is a decision about a specific
 * figure and the figure must not move underneath it.
 */
export function SponsorshipControl({
  tournamentId,
  current,
  approved,
}: {
  tournamentId: string;
  current: { amountKobo: number; source: string; recordedByName: string } | null;
  approved: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!current);
  const [naira, setNaira] = useState(current ? String(Math.round(current.amountKobo / 100)) : "");
  const [source, setSource] = useState(current?.source ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const amount = Number(naira);
    // Checked here as well as in the route so a typo answers immediately rather than after a round trip —
    // the route is still the authority.
    if (!Number.isInteger(amount) || amount <= 0) {
      setError("The sponsored amount must be a whole number of naira, more than zero.");
      return;
    }
    if (!source.trim()) {
      setError("Say where the money is coming from.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/sponsorship`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountKobo: amount * 100, source: source.trim() }),
    });
    const data = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="mt-3 rounded border border-border p-3">
      <p className="text-xs font-medium">Sponsorship record</p>

      {current && !editing ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            <span className="text-foreground">{current.source}</span> — ₦{Math.round(current.amountKobo / 100).toLocaleString("en-NG")}, recorded by{" "}
            {current.recordedByName}.
          </p>
          {!approved && (
            <button type="button" onClick={() => setEditing(true)} className="btn-ghost text-xs">
              Change
            </button>
          )}
        </div>
      ) : approved ? (
        <p className="mt-1 text-xs text-muted">No sponsorship was recorded before this payout was approved.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Amount (₦)
              <input value={naira} onChange={(e) => setNaira(e.target.value)} inputMode="numeric" className="field-input w-32" />
            </label>
            <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs text-muted">
              Where it is coming from
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                maxLength={200}
                placeholder="Q3 marketing budget, or a partner's name"
                className="field-input"
              />
            </label>
            <button type="button" disabled={submitting} onClick={save} className="btn-secondary text-xs">
              {submitting ? "Saving…" : current ? "Replace record" : "Record sponsorship"}
            </button>
            {current && (
              <button type="button" disabled={submitting} onClick={() => setEditing(false)} className="btn-ghost text-xs">
                Cancel
              </button>
            )}
          </div>
          <p className="text-xs text-muted">
            This has to cover the whole amount coming out of Circuit&apos;s balance. It is a declaration, not a
            transfer — recording it here moves no money.
          </p>
        </div>
      )}

      {error && <p className="field-error mt-2">{error}</p>}
    </div>
  );
}
