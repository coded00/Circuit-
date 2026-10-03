"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Staff: deliver a paid order (with a note the buyer reads), or cancel it and refund the buyer's wallet. */
export function OrderActions({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "fulfil" | "cancel") {
    if (action === "cancel" && !confirm("Cancel this order and refund the buyer's wallet?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/marketplace/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    if (!res.ok) setError((await res.json().catch(() => null))?.error ?? "Couldn't update the order.");
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label="Note to the buyer"
        placeholder="Delivery details or the reason for cancelling (the buyer sees this)"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="field-input"
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => act("fulfil")} className="btn-primary">
          Mark delivered
        </button>
        <button type="button" disabled={busy} onClick={() => act("cancel")} className="btn-danger">
          Cancel and refund
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
