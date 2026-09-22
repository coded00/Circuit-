"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/Spinner";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";

export default function CancelButton({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const confirmDialog = useConfirmDialog();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const confirmed = await confirmDialog({
      title: "Cancel this tournament?",
      message: "Every paid registrant will be refunded automatically.",
      confirmLabel: "Cancel tournament",
      cancelLabel: "Keep it",
    });
    if (!confirmed) return;
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
    <div className="flex flex-col gap-2">
      <button onClick={handleClick} disabled={submitting} className="btn-danger">
        {submitting && <Spinner />}
        {submitting ? "Cancelling…" : "Cancel tournament"}
      </button>
      {error && <p className="field-error motion-fade-in">{error}</p>}
    </div>
  );
}
