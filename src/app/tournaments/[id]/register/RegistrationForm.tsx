"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegistrationForm({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [inGameId, setInGameId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch(`/api/tournaments/${tournamentId}/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inGameId }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    if (data.authorizationUrl) {
      window.location.href = data.authorizationUrl;
      return;
    }

    router.push(`/tournaments/${tournamentId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="inGameId" className="text-sm font-medium">
          In-game ID
        </label>
        <input
          id="inGameId"
          required
          value={inGameId}
          onChange={(e) => setInGameId(e.target.value)}
          className="rounded border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-black"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Registering…" : "Register"}
      </button>
    </form>
  );
}
