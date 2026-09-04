"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PlayerOption = { id: string; displayName: string; handle: string };

export default function RulingForm({
  endpoint,
  playerA,
  playerB,
  allowVoid,
}: {
  disputeId: string;
  endpoint: string;
  playerA: PlayerOption;
  playerB: PlayerOption;
  allowVoid: boolean;
}) {
  const router = useRouter();
  const [winnerId, setWinnerId] = useState("");
  const [voidMatch, setVoidMatch] = useState(false);
  const [ruling, setRuling] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ruling,
        winnerId: voidMatch ? undefined : winnerId,
        voidMatch,
      }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Ruling</legend>
        {[playerA, playerB].map((player) => (
          <label key={player.id} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="ruledWinnerId"
              value={player.id}
              checked={!voidMatch && winnerId === player.id}
              onChange={() => {
                setWinnerId(player.id);
                setVoidMatch(false);
              }}
            />
            {player.displayName} wins
          </label>
        ))}
        {allowVoid && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="ruledWinnerId"
              checked={voidMatch}
              onChange={() => setVoidMatch(true)}
            />
            Void this match (no winner)
          </label>
        )}
      </fieldset>

      <textarea
        required
        placeholder="Brief explanation of the ruling"
        value={ruling}
        onChange={(e) => setRuling(e.target.value)}
        rows={3}
        className="rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting || (!voidMatch && !winnerId)}
        className="w-fit rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Submitting ruling…" : "Submit ruling"}
      </button>
    </form>
  );
}
