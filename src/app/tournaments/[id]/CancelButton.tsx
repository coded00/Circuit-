"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelButton({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!confirm("Cancel this tournament? Every paid registrant will be refunded automatically.")) {
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/tournaments/${tournamentId}/cancel`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <button onClick={handleClick} disabled={submitting} className="btn-danger w-fit">
        {submitting ? "Cancelling…" : "Cancel tournament"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
