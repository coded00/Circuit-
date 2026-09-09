"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";

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
      <p className={`alert ${status === "SUCCESS" ? "alert-success" : "alert-info"}`}>
        {status === "SUCCESS" && <Trophy size={14} />}
        {status === "SUCCESS" ? "Prize payout sent!" : "Prize payout initiated — processing."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={handleClick} disabled={submitting} className="btn-primary">
        {!submitting && <Trophy size={14} />}
        {submitting ? "Claiming…" : "Claim prize"}
      </button>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
