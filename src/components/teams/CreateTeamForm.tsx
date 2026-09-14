"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateTeamForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, tag: tag || null }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    router.push(`/teams/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="team-name" className="field-label">Team name</label>
          <input
            id="team-name"
            required
            placeholder="e.g. Lagos Ronin"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field-input"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="team-tag" className="field-label">Tag (optional)</label>
          <input
            id="team-tag"
            placeholder="e.g. LGR"
            maxLength={8}
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="field-input"
          />
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
      <button type="submit" disabled={submitting || !name.trim()} className="btn-primary w-fit">
        {submitting ? "Creating…" : "Create Team"}
      </button>
    </form>
  );
}
