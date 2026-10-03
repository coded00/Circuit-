"use client";

/**
 * Circuit — the teams in a community. Captains add their own team (if
 * they're a member); captains and moderators can take a team off.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Shield, X } from "lucide-react";

type TeamRow = { id: string; name: string; tag: string | null; game: string | null; captainId: string; memberCount: number };

export function CommunityTeams({
  communityId,
  teams,
  viewerId,
  canModerate,
  addable,
}: {
  communityId: string;
  teams: TeamRow[];
  viewerId: string | null;
  canModerate: boolean;
  /** Teams the viewer captains that aren't here yet (empty if they can't add). */
  addable: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError((await res?.json().catch(() => null))?.error ?? "Something went wrong.");
    setPicked("");
    router.refresh();
  }

  if (teams.length === 0 && addable.length === 0) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-display text-lg font-bold tracking-tight">Teams</h2>
      {teams.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {teams.map((t) => (
            <div key={t.id} className="flex items-center gap-3 cut-sm [--cut-line:var(--border)] border border-border bg-surface p-3">
              <span className="font-display flex h-10 w-10 shrink-0 items-center justify-center cut-avatar bg-accent-volt text-xs font-bold text-accent-volt-foreground">
                {(t.tag || t.name).replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase()}
              </span>
              <Link href={`/teams/${t.id}`} className="flex min-w-0 flex-1 flex-col hover:underline">
                <span className="truncate text-sm font-semibold">{t.name}</span>
                <span className="truncate text-xs text-muted">
                  {[t.game, `${t.memberCount} player${t.memberCount === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                </span>
              </Link>
              {(canModerate || t.captainId === viewerId) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => call(`/api/communities/${communityId}/teams/${t.id}`, "DELETE")}
                  aria-label={`Remove ${t.name}`}
                  className="flex h-8 w-8 items-center justify-center cut-avatar text-muted hover:bg-surface-elevated hover:text-foreground"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Shield size={14} /> No teams yet.
        </p>
      )}
      {addable.length > 0 && (
        <div className="flex gap-2">
          <select value={picked} onChange={(e) => setPicked(e.target.value)} className="field-select h-10 w-auto min-w-0 flex-1 sm:max-w-xs" aria-label="Your team">
            <option value="">Add a team you captain…</option>
            {addable.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="button" disabled={!picked || busy} onClick={() => call(`/api/communities/${communityId}/teams`, "POST", { teamId: picked })} className="btn-secondary h-10 gap-1.5 px-4 text-sm">
            <Plus size={15} /> Add
          </button>
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </section>
  );
}
