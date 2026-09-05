"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AcceptButton({ battleId }: { battleId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/battles/${battleId}/accept`, { method: "POST" });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    router.push(`/matches/${data.matchId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={submitting}
        className="w-fit rounded bg-foreground px-6 py-3 font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Accepting…" : "Accept Battle"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
