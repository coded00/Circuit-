"use client";

/** Circuit — staff add an official location or interest community. */

import { useState } from "react";
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

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary h-10 w-fit gap-1.5 px-4 text-sm">
        <Plus size={15} /> New official community
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="card flex flex-wrap items-end gap-3">
      <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
        <label className="field-label" htmlFor="oc-name">
          Name
        </label>
        <input id="oc-name" value={name} onChange={(e) => setName(e.target.value)} className="field-input" placeholder="e.g. Owerri" maxLength={40} />
      </div>
      <div className="flex min-w-[140px] flex-col gap-1.5">
        <label className="field-label" htmlFor="oc-cat">
          Type
        </label>
        <select id="oc-cat" value={category} onChange={(e) => setCategory(e.target.value as "LOCATION" | "INTEREST")} className="field-select">
          <option value="LOCATION">Location</option>
          <option value="INTEREST">Interest</option>
        </select>
      </div>
      {category === "LOCATION" && (
        <div className="flex min-w-[140px] flex-col gap-1.5">
          <label className="field-label" htmlFor="oc-region">
            City / state
          </label>
          <input id="oc-region" value={region} onChange={(e) => setRegion(e.target.value)} className="field-input" placeholder="Defaults to the name" maxLength={60} />
        </div>
      )}
      <div className="flex w-full flex-col gap-1.5">
        <label className="field-label" htmlFor="oc-desc">
          Description
        </label>
        <input id="oc-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="field-input" maxLength={300} />
      </div>
      {error && <p className="field-error w-full">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || name.trim().length < 3} className="btn-primary h-10 px-5 text-sm">
          {busy ? "Creating…" : "Create"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary h-10 px-4 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
