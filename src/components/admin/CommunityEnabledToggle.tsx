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
  const [error, setError] = useState<string | null>(null);

  async function save(nextEnabled: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/communities/${communityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: nextEnabled, reason }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError(((await res?.json().catch(() => null))?.error as string) ?? "Couldn't update this community. Try again.");
      if (!nextEnabled) setOpen(true);
      return;
    }
    setOpen(false);
    setReason("");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (enabled ? setOpen(true) : save(true))}
        disabled={busy}
        className={`btn-ghost !min-h-8 !px-2.5 !text-[12px] ${enabled ? "hover:!text-danger" : "!text-foreground"}`}
      >
        {busy && !open ? "…" : enabled ? "Suspend" : "Restore"}
      </button>
      {error && !open && <span className="text-[11px] text-danger">{error}</span>}
      <DialogOverlay open={open} onClose={() => setOpen(false)} label="Suspend community" maxWidth={440}>
        <div className="flex flex-col gap-3 px-5 pb-5 sm:pt-5">
          <h2 className="text-[16px] font-semibold">Suspend {name}?</h2>
          <p className="text-sm text-muted">Members lose access and it leaves discovery. The owner sees this reason and can appeal.</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} placeholder="Reason (e.g. repeated scam posts)" className="field-input resize-none" />
          {error && <p className="text-[12px] text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="button" onClick={() => save(false)} disabled={busy || reason.trim().length < 3} className="btn-danger-solid">
              {busy ? "Suspending…" : "Suspend community"}
            </button>
          </div>
        </div>
      </DialogOverlay>
    </>
  );
}
