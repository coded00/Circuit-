"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelBattleButton({ battleId }: { battleId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!confirm("Cancel this Battle?")) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/battles/${battleId}/cancel`, { method: "POST" });
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
      <button
        onClick={handleClick}
        disabled={submitting}
        className="w-fit rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-50 dark:border-red-900"
      >
        {submitting ? "Cancelling…" : "Cancel Battle"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
