"use client";

/** Circuit — staff add an official location or interest community. */

import { useState } from "react";
import { DialogOverlay } from "@/components/ui/Overlay";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export function NewOfficialCommunity() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"LOCATION" | "INTEREST">("LOCATION");
  const [region, setRegion] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category, region: category === "LOCATION" ? region || name : null, description }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError((await res?.json().catch(() => null))?.error ?? "Couldn't create it.");
    setOpen(false);
    setName("");
    setRegion("");
    setDescription("");
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        <Plus size={15} /> New official community
      </button>
      <DialogOverlay open={open} onClose={() => setOpen(false)} label="New official community" maxWidth={480}>
        <form onSubmit={submit} className="flex flex-col gap-4 px-5 pb-5 sm:pt-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-[16px] font-semibold">New official community</h2>
            <p className="text-[13px] text-muted">A staff-run city or interest community. Players find it in discovery and onboarding.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 sm:col-span-2" htmlFor="oc-name">
              <span className="field-label">Name</span>
              <input id="oc-name" value={name} onChange={(e) => setName(e.target.value)} className="field-input" placeholder="e.g. Owerri" maxLength={40} autoFocus />
            </label>
            <label className="flex flex-col gap-1.5" htmlFor="oc-cat">
              <span className="field-label">Type</span>
              <select id="oc-cat" value={category} onChange={(e) => setCategory(e.target.value as "LOCATION" | "INTEREST")} className="field-select">
                <option value="LOCATION">City / location</option>
                <option value="INTEREST">Interest</option>
              </select>
            </label>
            {category === "LOCATION" && (
              <label className="flex flex-col gap-1.5" htmlFor="oc-region">
                <span className="field-label">City / state</span>
                <input id="oc-region" value={region} onChange={(e) => setRegion(e.target.value)} className="field-input" placeholder="Defaults to the name" maxLength={60} />
              </label>
            )}
            <label className="flex flex-col gap-1.5 sm:col-span-2" htmlFor="oc-desc">
              <span className="field-label">Description</span>
              <input id="oc-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="field-input" maxLength={300} />
            </label>
          </div>
          {error && <p className="field-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={busy || name.trim().length < 3} className="btn-primary">
              {busy ? "Creating…" : "Create community"}
            </button>
          </div>
        </form>
      </DialogOverlay>
    </>
  );
}
