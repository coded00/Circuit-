"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/ToastProvider";

export default function AcceptButton({ battleId }: { battleId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setSubmitting(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch(`/api/battles/${battleId}/accept`, { method: "POST" });
    } catch {
      setError("We couldn't reach Circuit. Check your connection and try again.");
      setSubmitting(false);
      return;
    }
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    toast({ title: "Challenge accepted", message: "Head to your match and ready up." });
    router.push(`/matches/${data.matchId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={handleClick} disabled={submitting} className="btn-primary w-full">
        {submitting && <Spinner />}
        {submitting ? "Accepting…" : "Accept Challenge →"}
      </button>
      {error && <p className="field-error motion-fade-in">{error}</p>}
    </div>
  );
}
