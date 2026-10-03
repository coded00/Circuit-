"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { useToast } from "@/components/ToastProvider";

export default function CancelBattleButton({ battleId }: { battleId: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!(await confirmDialog({ title: "Cancel this Battle?", confirmLabel: "Cancel Battle", cancelLabel: "Keep it" }))) return;
    setSubmitting(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch(`/api/battles/${battleId}/cancel`, { method: "POST" });
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

    toast({ title: "Challenge cancelled", message: "Any stake is back in your wallet." });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={handleClick} disabled={submitting} className="btn-danger">
        {submitting ? "Cancelling…" : "Cancel Battle"}
      </button>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
