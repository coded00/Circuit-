"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";

type SearchResults = {
  tournaments: { id: string; name: string; game: string; status: string }[];
  battles: { id: string; game: string; format: string; status: string }[];
  users: { id: string; displayName: string; handle: string; avatarUrl: string | null }[];
};

const EMPTY: SearchResults = { tournaments: [], battles: [], users: [] };
const DEBOUNCE_MS = 300;

export function SearchInput({ className = "" }: { className?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      return;
    }
    const timeout = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) setResults(await res.json());
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const hasQuery = query.trim().length >= 2;
  const hasResults = results.tournaments.length > 0 || results.battles.length > 0 || results.users.length > 0;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search…"
          className="field-input min-w-0 truncate pl-9"
        />
      </div>

      {open && hasQuery && (
        <div className="absolute left-0 z-20 mt-2 w-full min-w-72 rounded-xl border border-border bg-surface shadow-lg">
          {loading ? (
            <p className="p-4 text-center text-sm text-muted">Searching…</p>
          ) : !hasResults ? (
            <p className="p-4 text-center text-sm text-muted">No results for &ldquo;{query}&rdquo;.</p>
          ) : (
            <div className="flex max-h-96 flex-col overflow-y-auto py-2">
              {results.tournaments.length > 0 && (
                <div className="flex flex-col">
                  <span className="px-4 py-1 text-xs font-bold tracking-wide text-muted uppercase">Tournaments</span>
                  {results.tournaments.map((t) => {
                    const status = tournamentStatusInfo(t.status);
                    return (
                      <Link
                        key={t.id}
                        href={`/tournaments/${t.id}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-surface-hover"
                      >
                        <span className="truncate">
                          {t.name} <span className="text-muted">· {t.game}</span>
                        </span>
                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                      </Link>
                    );
                  })}
                </div>
              )}
              {results.battles.length > 0 && (
                <div className="flex flex-col">
                  <span className="px-4 py-1 text-xs font-bold tracking-wide text-muted uppercase">Battles</span>
                  {results.battles.map((b) => (
                    <Link
                      key={b.id}
                      href={`/battles/${b.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-surface-hover"
                    >
                      <span className="truncate">{b.game}</span>
                      <span className="text-xs text-muted">{b.format === "BEST_OF_3" ? "Best of 3" : "Single"}</span>
                    </Link>
                  ))}
                </div>
              )}
              {results.users.length > 0 && (
                <div className="flex flex-col">
                  <span className="px-4 py-1 text-xs font-bold tracking-wide text-muted uppercase">Players</span>
                  {results.users.map((u) => (
                    <Link
                      key={u.id}
                      href={`/players/${u.handle}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-surface-hover"
                    >
                      <span className="truncate">{u.displayName}</span>
                      <span className="text-xs text-muted">@{u.handle}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
