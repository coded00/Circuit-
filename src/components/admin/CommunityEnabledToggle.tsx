"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DialogOverlay } from "@/components/ui/Overlay";

/** Staff suspend (with a reason the owner sees and can appeal) or restore one community. */
export function CommunityEnabledToggle({ communityId, enabled, name }: { communityId: string; enabled: boolean; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(nextEnabled: boolean) {
    setBusy(true);
    await fetch(`/api/admin/communities/${communityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: nextEnabled, reason }),
    }).catch(() => null);
    setBusy(false);
    setOpen(false);
    setReason("");
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => (enabled ? setOpen(true) : save(true))} disabled={busy} className={`btn-secondary h-8 px-3 text-xs ${enabled ? "text-danger" : ""}`}>
        {enabled ? "Suspend" : "Restore"}
      </button>
      <DialogOverlay open={open} onClose={() => setOpen(false)} label="Suspend community" maxWidth={440}>
        <div className="flex flex-col gap-3 px-5 pb-5 sm:pt-5">
          <h2 className="font-display text-xl font-bold tracking-tight">Suspend {name}?</h2>
          <p className="text-sm text-muted">Members lose access and it leaves discovery. The owner sees this reason and can appeal.</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} placeholder="Reason (e.g. repeated scam posts)" className="field-input resize-none" />
          <button type="button" onClick={() => save(false)} disabled={busy || reason.trim().length < 3} className="btn-primary h-10 bg-danger text-white">
            {busy ? "Suspending…" : "Suspend community"}
          </button>
        </div>
      </DialogOverlay>
    </>
  );
}
