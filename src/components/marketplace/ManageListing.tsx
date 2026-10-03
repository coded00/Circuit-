"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ListingStatus } from "@prisma/client";

/** The seller's own controls for a listing: pause/resume, mark sold, remove. */
export function ManageListing({ id, status, admin = false }: { id: string; status: ListingStatus; admin?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(next: ListingStatus) {
    if (next === "REMOVED" && !confirm("Remove this listing? It disappears from the Marketplace.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/marketplace/listings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) setError((await res.json().catch(() => null))?.error ?? "Couldn't update the listing.");
    setBusy(false);
    router.refresh();
  }

  if (status === "REMOVED" && !admin) return null;
  if (status === "REMOVED") {
    return (
      <button type="button" disabled={busy} onClick={() => set("ACTIVE")} className="btn-secondary w-fit">
        Restore
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "ACTIVE" && (
          <button type="button" disabled={busy} onClick={() => set("PAUSED")} className="btn-secondary">
            Pause
          </button>
        )}
        {(status === "PAUSED" || status === "SOLD") && (
          <button type="button" disabled={busy} onClick={() => set("ACTIVE")} className="btn-secondary">
            {status === "SOLD" ? "Relist" : "Resume"}
          </button>
        )}
        {status !== "SOLD" && (
          <button type="button" disabled={busy} onClick={() => set("SOLD")} className="btn-secondary">
            Mark sold
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => set("REMOVED")} className="btn-danger">
          Remove
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
