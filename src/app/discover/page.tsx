/**
 * Circuit — Discover. Phase 1 (Foundation): the player feed, cards, and
 * Add Friend. Phase 2 (Search & Filters): this page's own real
 * search/filter form. Phase 3 (Team Discovery): the Players/Teams tab
 * strip below, and everything on the Teams side — same GET-searchParams
 * server-component pattern as /compete throughout, not a new client-side
 * mechanism.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { Compass } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getDiscoverablePlayers, type DiscoveryFilters } from "@/lib/discovery";
import { getDiscoverableTeams, getRecommendedTeams, type TeamDiscoveryFilters } from "@/lib/teamDiscovery";
import { getPersonalizedSections } from "@/lib/discoveryPersonalized";
import { PlayerDiscoveryCard } from "@/components/discover/PlayerDiscoveryCard";
import { LoadMorePlayers } from "@/components/discover/LoadMorePlayers";
import { TeamDiscoveryCard } from "@/components/discover/TeamDiscoveryCard";
import { LoadMoreTeams } from "@/components/discover/LoadMoreTeams";
import { DiscoverySectionRow } from "@/components/discover/DiscoverySectionRow";

type SearchParams = { tab?: string; q?: string; game?: string; region?: string };

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/discover");

  const { tab, q, game, region } = await searchParams;
  const onTeams = tab === "teams";
  const hasFilters = !!(q || game || region);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-display flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
          <Compass size={24} className="text-accent-volt" />
          Discover
        </h1>
        <p className="text-sm text-muted">Find your next teammate, rival, or squad on Circuit.</p>
      </div>

      <div className="tabs">
        <Link href="/discover" className={`tab ${!onTeams ? "tab-active" : ""}`}>
          Players
        </Link>
        <Link href="/discover?tab=teams" className={`tab ${onTeams ? "tab-active" : ""}`}>
          Teams
        </Link>
      </div>

      <form className="card flex flex-wrap items-end gap-3">
        {onTeams && <input type="hidden" name="tab" value="teams" />}
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <label className="field-label" htmlFor="q">
            Search
          </label>
          <input
            id="q"
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder={onTeams ? "Team name" : "Name or @handle"}
            className="field-input"
          />
        </div>
        <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
          <label className="field-label" htmlFor="game">
            Game
          </label>
          <input id="game" type="text" name="game" defaultValue={game ?? ""} placeholder="e.g. Valorant" className="field-input" />
        </div>
        <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
          <label className="field-label" htmlFor="region">
            Region
          </label>
          <input id="region" type="text" name="region" defaultValue={region ?? ""} placeholder="e.g. Lagos" className="field-input" />
        </div>
        <button type="submit" className="btn-primary">
          Apply
        </button>
        {hasFilters && (
          <Link href={onTeams ? "/discover?tab=teams" : "/discover"} className="text-xs font-medium text-accent-blue hover:underline">
            Clear filters
          </Link>
        )}
      </form>

      {onTeams ? (
        <TeamsTab viewerId={user.id} favoriteGames={user.favoriteGames} filters={{ q, game, region }} hasFilters={hasFilters} />
      ) : (
        <PlayersTab viewerId={user.id} filters={{ q, game, region }} hasFilters={hasFilters} />
      )}
    </div>
  );
}

async function PlayersTab({ viewerId, filters, hasFilters }: { viewerId: string; filters: DiscoveryFilters; hasFilters: boolean }) {
  // Personalized sections only make sense on the unfiltered, browse-
  // casually view — once someone's actively searching/filtering for
  // something specific, "players you may know" isn't what they asked for.
  const [sections, { players, nextCursor }] = await Promise.all([
    hasFilters ? Promise.resolve([]) : getPersonalizedSections(viewerId),
    getDiscoverablePlayers({ viewerId, filters }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      {sections.map((section) => (
        <DiscoverySectionRow key={section.key} title={section.title}>
          {section.players.map((player) => (
            <div key={player.id} className="w-64 shrink-0">
              <PlayerDiscoveryCard player={player} />
            </div>
          ))}
        </DiscoverySectionRow>
      ))}

      <div className="flex flex-col gap-4">
        {sections.length > 0 && <h2 className="text-section-heading">All Players</h2>}
        {players.length === 0 ? (
          <div className="card flex flex-col items-center gap-1 py-12 text-center">
            <p className="text-sm text-muted">
              {hasFilters
                ? "We couldn't find anyone matching those filters. Try another game or broaden your search."
                : "No other players on Circuit yet — check back soon."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {players.map((player) => (
                <PlayerDiscoveryCard key={player.id} player={player} />
              ))}
            </div>
            <LoadMorePlayers initialCursor={nextCursor} filters={filters} />
          </>
        )}
      </div>
    </div>
  );
}

async function TeamsTab({
  viewerId,
  favoriteGames,
  filters,
  hasFilters,
}: {
  viewerId: string;
  favoriteGames: string[];
  filters: TeamDiscoveryFilters;
  hasFilters: boolean;
}) {
  const [recommended, { teams, nextCursor }] = await Promise.all([
    hasFilters ? Promise.resolve([]) : getRecommendedTeams(viewerId, favoriteGames),
    getDiscoverableTeams({ viewerId, filters }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      {recommended.length > 0 && (
        <DiscoverySectionRow title="Teams playing your games">
          {recommended.map((team) => (
            <div key={team.id} className="w-64 shrink-0">
              <TeamDiscoveryCard team={team} viewerId={viewerId} />
            </div>
          ))}
        </DiscoverySectionRow>
      )}

      <div className="flex flex-col gap-4">
        {recommended.length > 0 && <h2 className="text-section-heading">All Teams</h2>}
        {teams.length === 0 ? (
          <div className="card flex flex-col items-center gap-1 py-12 text-center">
            <p className="text-sm text-muted">
              {hasFilters
                ? "No teams match your search. Explore other teams or create your own."
                : "No other teams on Circuit yet — start one from the Teams page."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {teams.map((team) => (
                <TeamDiscoveryCard key={team.id} team={team} viewerId={viewerId} />
              ))}
            </div>
            <LoadMoreTeams initialCursor={nextCursor} viewerId={viewerId} filters={filters} />
          </>
        )}
      </div>
    </div>
  );
}
