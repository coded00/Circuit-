"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/ToastProvider";

export default function EnterMatchButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setSubmitting(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch(`/api/matches/${matchId}/enter`, { method: "POST" });
    } catch {
      setError("We couldn't reach Circuit. Check your connection and try again.");
      setSubmitting(false);
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    toast({ title: "You're in", message: "The match goes live once your opponent enters too." });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={handleClick} disabled={submitting} className="btn-primary w-full">
        {submitting && <Spinner />}
        {submitting ? "Entering…" : "Enter Match"}
      </button>
      {error && <p className="field-error motion-fade-in">{error}</p>}
    </div>
  );
}
