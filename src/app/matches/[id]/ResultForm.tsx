"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-lg font-semibold">Submit result</h2>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Winner</legend>
        {[playerA, playerB].map((player) => (
          <label key={player.id} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="winnerId"
              value={player.id}
              checked={winnerId === player.id}
              onChange={() => setWinnerId(player.id)}
              required
            />
            {player.displayName} (@{player.handle})
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="score" className="text-sm font-medium">
          Score
        </label>
        <input
          id="score"
          required
          placeholder="e.g. 3-1"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          className="rounded border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-black"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="proof" className="text-sm font-medium">
          Proof (screenshot or clip)
        </label>
        <input
          id="proof"
          name="proof"
          type="file"
          accept="image/*,video/*"
          required
          className="text-sm"
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          required
          className="mt-1"
        />
        I confirm the match code shown to both players is visible in this proof.
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-fit rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit result"}
      </button>
    </form>
  );
}
