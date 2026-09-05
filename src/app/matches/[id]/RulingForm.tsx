"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OptionCard } from "@/components/OptionCard";

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
      <div className="flex flex-col gap-2">
        <span className="field-label">Ruling</span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[playerA, playerB].map((player) => (
            <OptionCard
              key={player.id}
              selected={!voidMatch && winnerId === player.id}
              onSelect={() => {
                setWinnerId(player.id);
                setVoidMatch(false);
              }}
              title={`${player.displayName} wins`}
            />
          ))}
        </div>
        {allowVoid && (
          <OptionCard
            selected={voidMatch}
            onSelect={() => setVoidMatch(true)}
            title="Void this match"
            description="No winner — Battle only, nothing to return"
          />
        )}
      </div>

      <textarea
        required
        placeholder="Brief explanation of the ruling"
        value={ruling}
        onChange={(e) => setRuling(e.target.value)}
        rows={3}
        className="field-input"
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={submitting || (!voidMatch && !winnerId)}
        className="btn-primary w-fit"
      >
        {submitting ? "Submitting ruling…" : "Submit ruling"}
      </button>
    </form>
  );
}
