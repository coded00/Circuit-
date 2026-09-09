"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OptionCard } from "@/components/OptionCard";

type PlayerOption = { id: string; displayName: string; handle: string };

export default function ResultForm({
  matchId,
  playerA,
  playerB,
}: {
  matchId: string;
  playerA: PlayerOption;
  playerB: PlayerOption;
}) {
  const router = useRouter();
  const [winnerId, setWinnerId] = useState("");
  const [score, setScore] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    form.set("winnerId", winnerId);
    form.set("score", score);
    form.set("proofShowsMatchCode", confirmed ? "true" : "false");

    const res = await fetch(`/api/matches/${matchId}/results`, { method: "POST", body: form });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-5">
      <h2 className="text-card-title font-semibold">Submit result</h2>

      <div className="flex flex-col gap-1.5">
        <span className="field-label">Winner</span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[playerA, playerB].map((player) => (
            <OptionCard
              key={player.id}
              selected={winnerId === player.id}
              onSelect={() => setWinnerId(player.id)}
              title={player.displayName}
              description={`@${player.handle}`}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="score" className="field-label">
          Score
        </label>
        <input
          id="score"
          required
          placeholder="e.g. 3-1"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          className="field-input"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="proof" className="field-label">
          Proof (screenshot or clip)
        </label>
        <input
          id="proof"
          name="proof"
          type="file"
          accept="image/*,video/*"
          required
          className="field-input file:mr-3 file:rounded-[8px] file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          required
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong bg-surface-elevated accent-brand-blue"
        />
        I confirm the match code shown to both players is visible in this proof.
      </label>

      {error && <p className="field-error">{error}</p>}

      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting ? "Submitting…" : "Submit result"}
      </button>
    </form>
  );
}
