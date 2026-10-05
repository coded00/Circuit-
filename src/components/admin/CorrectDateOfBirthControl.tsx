"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Staff: set a player's date of birth (players can't change theirs once it is set). Needs a reason, which is logged. */
export function CorrectDateOfBirthControl({ userId, current }: { userId: string; current: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/users/${userId}/date-of-birth`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateOfBirth: value, reason }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      return;
    }
    setOpen(false);
    setReason("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <span className="text-muted">Date of birth</span>
        <span>{current ?? "Not set"}</span>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="btn-secondary text-xs">
            Correct…
          </button>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-2">
          <input type="date" value={value} onChange={(e) => setValue(e.target.value)} className="field-input w-48" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Reason (kept in the audit log)" className="field-input" />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !value || !reason.trim()} onClick={save} className="btn-primary text-xs">
              {busy ? "Saving…" : "Save correction"}
            </button>
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className="btn-secondary text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
