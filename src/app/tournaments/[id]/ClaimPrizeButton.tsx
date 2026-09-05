"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClaimPrizeButton({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleClick() {
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/tournaments/${tournamentId}/payout`, { method: "POST" });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    setStatus(data.status);
    setSubmitting(false);
    router.refresh();
  }

  if (status) {
    return (
      <p className="text-sm text-status-live">
        {status === "SUCCESS" ? "Prize payout sent! 🏆" : "Prize payout initiated — processing."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button onClick={handleClick} disabled={submitting} className="btn-primary w-fit">
        {submitting ? "Claiming…" : "🏆 Claim prize"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
