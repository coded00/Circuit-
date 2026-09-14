"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TeamSettingsForm({ teamId, name, tag }: { teamId: string; name: string; tag: string | null }) {
  const router = useRouter();
  const [nameValue, setNameValue] = useState(name);
  const [tagValue, setTagValue] = useState(tag ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue, tag: tagValue || null }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="settings-name" className="field-label">Team name</label>
          <input id="settings-name" required value={nameValue} onChange={(e) => setNameValue(e.target.value)} className="field-input" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="settings-tag" className="field-label">Tag</label>
          <input id="settings-tag" maxLength={8} value={tagValue} onChange={(e) => setTagValue(e.target.value)} className="field-input" />
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
      <button type="submit" disabled={submitting} className="btn-secondary w-fit text-sm">
        {submitting ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
