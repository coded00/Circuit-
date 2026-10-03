"use client";

/**
 * Circuit — community onboarding, the "which games do you play?" step
 * Discord asks when you join a server: pick games, join their official
 * hubs in one go. Shown on /communities until you're in at least one hub.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

type GameOption = { id: string; name: string; iconUrl: string | null };

export function PickYourGames({ games, preselected }: { games: GameOption[]; preselected: string[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(preselected));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function join() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/communities/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameIds: [...picked] }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError((await res?.json().catch(() => null))?.error ?? "Couldn't join right now. Try again.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="relative overflow-hidden cut-lg [--cut-line:var(--border)] border border-border bg-surface p-5 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_100%_0%,color-mix(in_srgb,var(--accent-volt)_14%,transparent),transparent_60%)]"
      />
      <div className="relative flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">Start here</span>
          <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">Which games do you play?</h2>
          <p className="text-sm text-muted">We&apos;ll drop you into each game&apos;s official hub. Squads, clips and tournament news.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {games.map((g) => {
            const on = picked.has(g.id);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => toggle(g.id)}
                aria-pressed={on}
                className={`flex h-10 items-center gap-2 rounded-full border pr-3.5 pl-1.5 text-sm font-semibold transition ${
                  on ? "border-accent-volt bg-accent-volt text-accent-volt-foreground" : "border-border bg-background hover:border-border-hover"
                }`}
              >
                {g.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- catalog icon
                  <img src={g.iconUrl} alt="" className="h-7 w-7 cut-avatar object-cover" />
                ) : (
                  <span className={`flex h-7 w-7 items-center justify-center cut-avatar text-[11px] font-bold ${on ? "bg-black/15" : "bg-surface-elevated"}`}>
                    {g.name.slice(0, 1)}
                  </span>
                )}
                {g.name}
                {on && <Check size={14} />}
              </button>
            );
          })}
        </div>
        {error && <p className="field-error">{error}</p>}
        <div>
          <button type="button" onClick={join} disabled={busy || picked.size === 0} className="btn-primary h-11 px-6">
            {busy ? "Joining…" : picked.size > 0 ? `Join ${picked.size} hub${picked.size === 1 ? "" : "s"}` : "Pick at least one"}
          </button>
        </div>
      </div>
    </section>
  );
}
