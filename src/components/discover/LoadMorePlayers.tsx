"use client";

/**
 * Circuit — "Load More" for /discover, same cursor/rows/loading shape as
 * src/app/notifications/LoadMoreNotifications.tsx, adapted to append into
 * a second grid (rather than a flex list) below the server-rendered first
 * page's grid — visually continuous since both use identical grid classes
 * and gap spacing.
 *
 * Known Phase-1 rough edge: FriendButton refreshes via router.refresh(),
 * which re-renders the server-fetched first page but not this component's
 * own client-held `players` state — so Add Friend on a page-2+ card sends
 * the real request successfully but won't flip that card's own button
 * label until a full reload. Acceptable for Foundation; a small local-state
 * patch is a natural Phase 6 polish item if it comes up in testing.
 */

import { useState } from "react";
import { PlayerDiscoveryCard } from "./PlayerDiscoveryCard";
import type { DiscoveryPlayer, DiscoveryFilters } from "@/lib/discovery";

export function LoadMorePlayers({
  initialCursor,
  filters = {},
}: {
  initialCursor: string | null;
  filters?: DiscoveryFilters;
}) {
  const [players, setPlayers] = useState<DiscoveryPlayer[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    const params = new URLSearchParams({ cursor });
    if (filters.q) params.set("q", filters.q);
    if (filters.game) params.set("game", filters.game);
    if (filters.region) params.set("region", filters.region);
    const res = await fetch(`/api/discover/players?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setPlayers((prev) => [...prev, ...data.players]);
      setCursor(data.nextCursor);
    }
    setLoading(false);
  }

  return (
    <>
      {players.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {players.map((p) => (
            <PlayerDiscoveryCard key={p.id} player={p} />
          ))}
        </div>
      )}
      {cursor && (
        <button type="button" onClick={loadMore} disabled={loading} className="btn-secondary self-center">
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </>
  );
}
