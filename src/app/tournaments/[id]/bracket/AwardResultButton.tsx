"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gavel } from "lucide-react";
import { DRAW_RESULT } from "@/lib/leagueTable";

type Side = { id: string; name: string };

/** An organizer settles a fixture nobody played by its deadline. */
export function AwardResultButton({ matchId, playerA, playerB, drawAllowed }: { matchId: string; playerA: Side; playerB: Side; drawAllowed: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [score, setScore] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    const res = await fetch(`/api/matches/${matchId}/award`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, ...(score.trim() ? { score: score.trim() } : {}) }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    setOpen(false);
    setSubmitting(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary h-8 shrink-0 gap-1.5 px-3 text-xs">
        <Gavel size={12} />
        Settle
      </button>
    );
  }

  const options = [
    { value: playerA.id, label: `${playerA.name} wins` },
    { value: playerB.id, label: `${playerB.name} wins` },
    ...(drawAllowed ? [{ value: DRAW_RESULT, label: "Draw" }] : []),
  ];

  return (
    <div className="flex w-full flex-col gap-2 rounded-[10px] border border-border bg-surface-elevated p-3" onClick={(e) => e.preventDefault()}>
      <span className="text-xs font-semibold">Settle this unplayed fixture</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={outcome === o.value}
            onClick={() => setOutcome(o.value)}
            className={`cut-xs border px-3 py-1 text-xs font-medium transition ${outcome === o.value ? "border-accent-volt bg-accent-volt-soft" : "border-border hover:border-border-strong"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <input
        value={score}
        onChange={(e) => setScore(e.target.value)}
        placeholder={outcome === DRAW_RESULT ? "Score (optional, default 0-0)" : "Score (optional, default 3-0)"}
        className="field-input h-9 font-mono text-sm"
        maxLength={7}
      />
      {error && <p className="field-error text-xs">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={!outcome || submitting} onClick={submit} className="btn-primary h-8 px-3 text-xs">
          {submitting ? "Saving…" : "Confirm"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary h-8 px-3 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}
