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
    <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="inGameId" className="field-label">
          In-game ID
        </label>
        <input
          id="inGameId"
          required
          value={inGameId}
          onChange={(e) => setInGameId(e.target.value)}
          className="field-input"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitting ? "Registering…" : "Register"}
      </button>
    </form>
  );
}
