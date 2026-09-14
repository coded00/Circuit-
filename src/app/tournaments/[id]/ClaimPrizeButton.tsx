"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { Spinner } from "@/components/Spinner";

// A fixed spread, not random — random left/delay values would recompute on
// every re-render and jitter the burst. Colors reuse real brand/status
// tokens, not arbitrary confetti colors.
const CONFETTI_PIECES = [
  { left: "8%", delay: "0ms", color: "var(--gold)" },
  { left: "22%", delay: "80ms", color: "var(--accent-blue)" },
  { left: "38%", delay: "40ms", color: "var(--success)" },
  { left: "52%", delay: "140ms", color: "var(--accent-volt)" },
  { left: "66%", delay: "20ms", color: "var(--gold)" },
  { left: "80%", delay: "120ms", color: "var(--accent-orange)" },
  { left: "92%", delay: "60ms", color: "var(--accent-blue)" },
];

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
    const success = status === "SUCCESS";
    return (
      <div className={`alert relative motion-fade-in ${success ? "alert-success" : "alert-info"}`}>
        {/* A real payout that just genuinely succeeded — not a fabricated
            "new" moment, the literal outcome of the click above. */}
        {success && (
          <div className="confetti-burst" aria-hidden>
            {CONFETTI_PIECES.map((piece, i) => (
              <span
                key={i}
                className="confetti-piece"
                style={{ left: piece.left, animationDelay: piece.delay, backgroundColor: piece.color }}
              />
            ))}
          </div>
        )}
        {success && <Trophy size={14} className="trophy-pop" />}
        {success ? "Prize payout sent!" : "Prize payout initiated — processing."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={handleClick} disabled={submitting} className="btn-primary">
        {submitting ? <Spinner /> : <Trophy size={14} />}
        {submitting ? "Claiming…" : "Claim prize"}
      </button>
      {error && <p className="field-error motion-fade-in">{error}</p>}
    </div>
  );
}
