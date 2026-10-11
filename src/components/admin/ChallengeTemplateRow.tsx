"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Circuit — one template in the library: its switch, the days it runs, and its money. Switching it on puts its challenge
 * on the homepage on those days. Only a Super Admin can change anything here; everyone else sees the state.
 */
export function ChallengeTemplateRow({
  templateKey,
  title,
  kindLabel,
  game,
  summary,
  checkLabel,
  prizeTotalNaira,
  gamePublished,
  initial,
  canEdit,
}: {
  templateKey: string;
  title: string;
  kindLabel: string;
  game: string;
  summary: string;
  checkLabel: string;
  prizeTotalNaira: string;
  gamePublished: boolean;
  initial: { enabled: boolean; weekdays: number[]; entryFeeNaira: string; lastResult: string | null; launchedOn: string | null };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [fee, setFee] = useState(initial.entryFeeNaira);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await fetch(`/api/admin/challenge-templates/${templateKey}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function launch() {
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await fetch(`/api/admin/challenge-templates/${templateKey}/launch`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      return;
    }
    setNote("Launched. It's on the Challenges board now.");
    router.refresh();
  }

  const toggleDay = (d: number) => {
    const next = initial.weekdays.includes(d) ? initial.weekdays.filter((x) => x !== d) : [...initial.weekdays, d];
    void patch({ weekdays: next });
  };

  return (
    <div className="flex flex-col gap-3 rounded-[8px] border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-foreground">{title}</span>
            <span className="rounded-[6px] bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-muted">{kindLabel}</span>
            <span className="text-[12px] text-muted">{game}</span>
          </span>
          <span className="text-[12px] text-muted">{summary}</span>
          <span className="text-[12px] text-muted">
            Prizes up to <strong className="text-foreground">{prizeTotalNaira}</strong> · {checkLabel}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={initial.enabled}
          aria-label={`${title} on or off`}
          disabled={!canEdit || busy || (!initial.enabled && !gamePublished)}
          onClick={() => patch({ enabled: !initial.enabled })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${initial.enabled ? "bg-accent-volt" : "bg-white/15"} disabled:opacity-50`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all ${initial.enabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      {!gamePublished && (
        <p className="text-[12px] text-gold">
          {game} isn&apos;t published yet, so this can&apos;t be switched on. Publish it in{" "}
          <Link href="/admin/games" className="underline">
            Admin → Games
          </Link>
          .
        </p>
      )}

      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted uppercase">Runs on</span>
          <div className="flex gap-1">
            {DAYS.map((label, d) => (
              <button
                key={d}
                type="button"
                disabled={!canEdit || busy}
                aria-pressed={initial.weekdays.includes(d)}
                onClick={() => toggleDay(d)}
                className={`cut-xs h-8 w-10 text-[12px] ${initial.weekdays.includes(d) ? "bg-foreground text-background" : "bg-surface-elevated text-muted"} disabled:opacity-60`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-[11px] text-muted uppercase">
          Entry fee (₦, blank = ₦1,000, 0 = free)
          <span className="flex gap-1.5">
            <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" disabled={!canEdit || busy} className="field-input w-28" placeholder="1000" />
            {canEdit && (
              <button
                type="button"
                disabled={busy}
                className="btn-secondary text-xs"
                onClick={() => patch({ entryFee: fee.trim() === "" ? null : Math.round(Number(fee) * 100) })}
              >
                Save
              </button>
            )}
          </span>
        </label>
        {canEdit && (
          <button type="button" disabled={busy || !gamePublished} onClick={launch} className="btn-secondary text-xs">
            Launch today
          </button>
        )}
      </div>

      {(initial.lastResult || initial.launchedOn) && <p className="text-[12px] text-muted">Last: {initial.lastResult ?? `launched ${initial.launchedOn}`}</p>}
      {note && <p className="text-[12px] text-muted">{note}</p>}
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}
