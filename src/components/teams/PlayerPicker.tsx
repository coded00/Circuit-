"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { PlayerSearchState } from "@/lib/playerSearch";

export type PickedPlayer = { id: string; handle: string; displayName: string; avatarUrl: string | null };
type Result = PickedPlayer & { state: PlayerSearchState };

const STATE_LABEL: Record<PlayerSearchState, string> = { available: "", member: "On the team", invited: "Invited", captain: "Captain" };

/**
 * Type a handle or name, pick a player. `teamId` (the captain's own team)
 * marks people already on it; `excludeIds` hides ones the parent has already
 * picked. Picking calls `onPick` and clears the box.
 */
export function PlayerPicker({
  onPick,
  teamId,
  excludeIds = [],
  placeholder = "Search players by handle or name",
  disabled = false,
}: {
  onPick: (player: PickedPlayer) => void | Promise<void>;
  teamId?: string;
  excludeIds?: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  // The last search the server answered; results are shown only while they match what's typed.
  const [found, setFound] = useState<{ q: string; players: Result[] } | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const q = query.trim().replace(/^@/, "");
  const results = found?.q === q ? found.players : [];
  const loading = q.length >= 2 && found?.q !== q;

  useEffect(() => {
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/players/search?q=${encodeURIComponent(q)}${teamId ? `&teamId=${teamId}` : ""}`);
        const data = await res.json();
        setFound({ q, players: res.ok ? data.players : [] });
      } catch {
        setFound({ q, players: [] });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, teamId]);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  const visible = results.filter((r) => !excludeIds.includes(r.id));

  async function choose(player: Result) {
    setOpen(false);
    setQuery("");
    await onPick({ id: player.id, handle: player.handle, displayName: player.displayName, avatarUrl: player.avatarUrl });
  }

  return (
    <div ref={box} className="relative">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open && q.length >= 2}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className="field-input w-full pl-9"
        />
      </div>
      {open && q.length >= 2 && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1.5 max-h-72 w-full overflow-auto rounded-[12px] border border-border bg-surface-elevated p-1 shadow-lg">
          {loading && visible.length === 0 && <li className="px-3 py-2 text-xs text-muted">Searching…</li>}
          {!loading && visible.length === 0 && <li className="px-3 py-2 text-xs text-muted">No players found for “{q}”.</li>}
          {visible.map((p) => {
            const unavailable = p.state !== "available";
            return (
              <li key={p.id} role="option" aria-selected={false} aria-disabled={unavailable}>
                <button
                  type="button"
                  disabled={unavailable}
                  onClick={() => choose(p)}
                  className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left text-sm transition enabled:hover:bg-surface disabled:opacity-50"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-xs font-semibold">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" /> : (p.displayName || p.handle).charAt(0).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{p.displayName || p.handle}</span>
                    <span className="truncate font-mono text-xs text-muted">@{p.handle}</span>
                  </span>
                  {unavailable && <span className="shrink-0 text-xs text-muted">{STATE_LABEL[p.state]}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
