"use client";

/**
 * Circuit — "Load More" for Discover Teams, same shape as
 * LoadMorePlayers.tsx.
 */

import { useState } from "react";
import { TeamDiscoveryCard } from "./TeamDiscoveryCard";
import type { DiscoveryTeam, TeamDiscoveryFilters } from "@/lib/teamDiscovery";

export function LoadMoreTeams({
  initialCursor,
  viewerId,
  filters = {},
}: {
  initialCursor: string | null;
  viewerId: string;
  filters?: TeamDiscoveryFilters;
}) {
  const [teams, setTeams] = useState<DiscoveryTeam[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    const params = new URLSearchParams({ cursor });
    if (filters.q) params.set("q", filters.q);
    if (filters.game) params.set("game", filters.game);
    if (filters.region) params.set("region", filters.region);
    const res = await fetch(`/api/discover/teams?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setTeams((prev) => [...prev, ...data.teams]);
      setCursor(data.nextCursor);
    }
    setLoading(false);
  }

  return (
    <>
      {teams.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {teams.map((t) => (
            <TeamDiscoveryCard key={t.id} team={t} viewerId={viewerId} />
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
