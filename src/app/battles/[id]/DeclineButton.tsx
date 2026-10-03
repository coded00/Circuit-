"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { useToast } from "@/components/ToastProvider";

/** The player a challenge was sent to says no. */
export default function DeclineButton({ battleId }: { battleId: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decline() {
    if (!(await confirmDialog({ title: "Decline this challenge?", confirmLabel: "Decline", cancelLabel: "Keep it" }))) return;
    setBusy(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch(`/api/battles/${battleId}/decline`, { method: "POST" });
    } catch {
      setError("We couldn't reach Circuit. Check your connection and try again.");
      setBusy(false);
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Something went wrong. Please try again.");
      setBusy(false);
      return;
    }
    toast({ title: "Challenge declined", message: "We've let them know." });
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" onClick={decline} disabled={busy} className="btn-secondary">
        {busy ? "Declining…" : "Decline"}
      </button>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
