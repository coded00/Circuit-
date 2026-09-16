"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TeamSettingsForm({
  teamId,
  name,
  tag,
  game,
  region,
}: {
  teamId: string;
  name: string;
  tag: string | null;
  game: string | null;
  region: string | null;
}) {
  const router = useRouter();
  const [nameValue, setNameValue] = useState(name);
  const [tagValue, setTagValue] = useState(tag ?? "");
  const [gameValue, setGameValue] = useState(game ?? "");
  const [regionValue, setRegionValue] = useState(region ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue, tag: tagValue || null, game: gameValue || null, region: regionValue || null }),
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="settings-game" className="field-label">Game (optional)</label>
          <input
            id="settings-game"
            placeholder="e.g. Valorant"
            value={gameValue}
            onChange={(e) => setGameValue(e.target.value)}
            className="field-input"
          />
          <span className="field-hint">Helps other players discover your team when browsing by game.</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="settings-region" className="field-label">Region (optional)</label>
          <input
            id="settings-region"
            placeholder="e.g. Lagos, Nigeria"
            value={regionValue}
            onChange={(e) => setRegionValue(e.target.value)}
            className="field-input"
          />
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
      <button type="submit" disabled={submitting} className="btn-secondary w-fit text-sm">
        {submitting ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
