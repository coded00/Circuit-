"use client";

/**
 * Responsible play: the cool-off a player can put on their own staked
 * Battles, and the only control on this page that isn't a simple toggle.
 *
 * Two things make it different from `PrivacyForm` next door, and both are
 * deliberate. It is a form with a confirm step rather than a save-as-you-go
 * switch, because the player cannot undo it — a switch that flips back is
 * exactly the affordance this must not offer. And it never sends a bare
 * boolean: the server takes a number of days and decides the rest, so there
 * is no request this component could make that clears an exclusion.
 *
 * The settings are handed in from `page.tsx`, so `router.refresh()` after a
 * successful save re-renders this with the dates the server actually stored —
 * see the comment on `formatSelfExclusionDate` for why the preview computed
 * here and the stored value agree.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { formatSelfExclusionDate, isSelfExcluded, selfExclusionEnd } from "@/lib/selfExclusion";

const DEFAULT_DAYS = 7;

const DURATIONS: { days: number; label: string }[] = [
  { days: 1, label: "1 day" },
  { days: DEFAULT_DAYS, label: "1 week" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
  { days: 1825, label: "5 years" },
];

export default function ResponsiblePlayForm({
  initialUntil,
  initialStartedAt,
}: {
  initialUntil: string | null;
  initialStartedAt: string | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const [days, setDays] = useState(DEFAULT_DAYS);
  // The end date being confirmed, or null while nothing is. It holds a Date
  // rather than a boolean so the date the player agreed to is fixed at the
  // moment they asked — a preview recomputed on every render could shift a day
  // under them while they read it, and "until 14 October" has to mean one
  // thing in the prompt and the confirmation that follows it.
  const [confirming, setConfirming] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const until = initialUntil ? new Date(initialUntil) : null;
  const startedAt = initialStartedAt ? new Date(initialStartedAt) : null;
  // Narrowed once, so the active branch below can use the date itself rather
  // than an `isSelfExcluded(until)` re-check that TypeScript can't follow.
  const exclusionEnd = isSelfExcluded(until) ? until : null;
  const paused = exclusionEnd !== null;

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/account/self-exclusion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    }).catch(() => null);
    setSaving(false);

    if (res?.ok) {
      toast({
        title: paused ? "Cool-off extended" : "Staked Battles paused",
        // The server's own date comes back on the refresh below; this is only
        // for the toast, and it is the date that was agreed to on screen.
        message: confirming ? `You're paused until ${formatSelfExclusionDate(confirming)}.` : undefined,
      });
      setConfirming(null);
      router.refresh();
      return;
    }

    // A refusal here is the shorten rule, and the server's message names the
    // end date already on file — worth showing as-is rather than replacing
    // with a generic failure.
    const body = res ? await res.json().catch(() => null) : null;
    const message = body && typeof body.error === "string" ? body.error : null;
    setError(message ?? "Couldn't save that. Check your connection and try again.");
    if (!message) toast({ title: "Couldn't save that", message: "Check your connection and try again.", tone: "error" });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold">Staked Battles</h2>
          {exclusionEnd ? (
            <p className="text-sm text-muted">
              You&apos;ve paused staked Battles until <span className="font-medium text-foreground">{formatSelfExclusionDate(exclusionEnd)}</span>
              {startedAt && <> — on a break since {formatSelfExclusionDate(startedAt)}</>}. You can&apos;t open, host or accept a
              staked Battle until then. Free Battles, tournaments and your wallet are unaffected.
            </p>
          ) : (
            <p className="text-sm text-muted">
              Open for staked Battles. Free Battles, tournaments and your wallet are unaffected either way.
            </p>
          )}
        </div>

        {paused && (
          <p className="text-[13px] text-muted">
            Only Circuit support can lift this early. You can extend it as often as you like, but never shorten it.
          </p>
        )}
      </section>

      <fieldset className="card flex flex-col gap-4" disabled={saving}>
        <legend className="sr-only">{paused ? "Extend your cool-off" : "Pause staked Battles"}</legend>
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold">{paused ? "Extend your cool-off" : "Pause staked Battles"}</h2>
          <p className="text-sm text-muted">
            {paused
              ? "Pick how much longer you want. This replaces the end date with a later one."
              : "Take a break from staking. Once it's set you can't undo it yourself — support can lift it if you ask."}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {DURATIONS.map((option) => (
            <label
              key={option.days}
              className={`flex cursor-pointer items-center gap-3 cut-sm border p-3 transition ${days === option.days ? "border-accent-volt bg-accent-volt-soft" : "border-border hover:border-border-strong"}`}
            >
              <input
                type="radio"
                name="selfExclusionDays"
                value={option.days}
                checked={days === option.days}
                onChange={() => {
                  setDays(option.days);
                  setConfirming(null);
                }}
                className="h-4 w-4 shrink-0"
              />
              <span className="text-sm font-semibold">{option.label}</span>
            </label>
          ))}
        </div>

        {error && (
          <p className="alert alert-danger" role="alert">
            {error}
          </p>
        )}

        {confirming ? (
          <div className="flex flex-col gap-3 cut-sm border border-border-strong p-3.5">
            <p className="text-sm">
              {paused ? "Extend" : "Pause staked Battles"} until <span className="font-semibold">{formatSelfExclusionDate(confirming)}</span>?
              You won&apos;t be able to change this back yourself.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => void submit()} disabled={saving}>
                {saving ? "Saving…" : "Yes, confirm"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setConfirming(null)} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button type="button" className="btn-secondary" onClick={() => setConfirming(selfExclusionEnd(days))}>
              {paused ? "Extend cool-off" : "Pause staked Battles"}
            </button>
          </div>
        )}
      </fieldset>
    </div>
  );
}
