"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { InfoTip } from "@/components/InfoTip";
import { PlayerPicker, type PickedPlayer } from "./PlayerPicker";

export function CreateTeamForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [invitees, setInvitees] = useState<PickedPlayer[]>([]);
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
    // Invites go out one by one once the team exists; a failed one doesn't undo the team.
    for (const player of invitees) {
      await fetch(`/api/teams/${data.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: player.handle }),
      }).catch(() => undefined);
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
      <div className="flex flex-col gap-1.5">
        <span className="field-label flex items-center gap-1.5">
          Invite players (optional)
          <InfoTip text="Search for players on Circuit. They get an invite and join the team once they accept. You can also invite people later from the team page." />
        </span>
        <PlayerPicker excludeIds={invitees.map((p) => p.id)} onPick={(p) => setInvitees((list) => [...list, p])} placeholder="Search players by handle or name" />
        {invitees.length > 0 && (
          <ul className="flex flex-wrap gap-2 pt-1">
            {invitees.map((p) => (
              <li key={p.id} className="flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated py-1 pr-1.5 pl-3 text-xs">
                <span className="font-mono">@{p.handle}</span>
                <button type="button" aria-label={`Remove @${p.handle}`} onClick={() => setInvitees((list) => list.filter((x) => x.id !== p.id))} className="rounded-full p-0.5 text-muted hover:text-foreground">
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="field-error">{error}</p>}
      <button type="submit" disabled={submitting || !name.trim()} className="btn-primary w-fit">
        {submitting ? "Creating…" : "Create Team"}
      </button>
    </form>
  );
}
