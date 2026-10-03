"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Staff: deliver a paid order (with a note the buyer reads), or cancel it and refund the buyer's wallet. */
/** `delivered`: the order is already marked delivered, so the only action left is a refund. */
export function OrderActions({ id, delivered = false }: { id: string; delivered?: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "fulfil" | "cancel" | "refund") {
    if ((action === "cancel" || action === "refund") && !confirm("Refund the buyer's wallet" + (action === "refund" ? " and stop their download?" : " and cancel this order?"))) return;
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
        placeholder={delivered ? "Why you are refunding (the buyer sees this)" : "Delivery details or the reason for cancelling (the buyer sees this)"}
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="field-input"
      />
      <div className="flex flex-wrap gap-2">
        {delivered ? (
          <button type="button" disabled={busy} onClick={() => act("refund")} className="btn-danger">
            Refund
          </button>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => act("fulfil")} className="btn-primary">
              Mark delivered
            </button>
            <button type="button" disabled={busy} onClick={() => act("cancel")} className="btn-danger">
              Cancel and refund
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
