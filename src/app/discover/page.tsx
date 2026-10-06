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
import { loginPath } from "@/lib/safeRedirect";
import { MapPin, Search, Users, X } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getDiscoverablePlayers, type DiscoveryFilters } from "@/lib/discovery";
import { getDiscoverableTeams, getRecommendedTeams, type TeamDiscoveryFilters } from "@/lib/teamDiscovery";
import { getPersonalizedSections } from "@/lib/discoveryPersonalized";
import { PlayerDiscoveryCard } from "@/components/discover/PlayerDiscoveryCard";
import { LoadMorePlayers } from "@/components/discover/LoadMorePlayers";
import { TeamDiscoveryCard } from "@/components/discover/TeamDiscoveryCard";
import { LoadMoreTeams } from "@/components/discover/LoadMoreTeams";
import { DiscoverySectionRow } from "@/components/discover/DiscoverySectionRow";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Discover Players and Tournaments",
  description:
    "Discover gamers, teams and tournaments to follow on Circuit.",
  path: "/discover",
  noindex: true,
});


type SearchParams = { tab?: string; q?: string; game?: string; region?: string };

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath("/discover"));

  const { tab, q, game, region } = await searchParams;
  const onTeams = tab === "teams";
  const hasFilters = !!(q || game || region);
  const base = onTeams ? "/discover?tab=teams" : "/discover";

  const [playerCount, teamCount, games] = await Promise.all([
    prisma.user.count({ where: { isSuspended: false, NOT: { id: user.id } } }),
    prisma.team.count(),
    prisma.game.findMany({ where: { enabled: true, publishedAt: { not: null } }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  /** Same page with one filter removed. */
  const without = (key: "q" | "game" | "region") => {
    const params = new URLSearchParams();
    if (onTeams) params.set("tab", "teams");
    for (const [k, v] of Object.entries({ q, game, region })) if (v && k !== key) params.set(k, v);
    const qs = params.toString();
    return qs ? `/discover?${qs}` : "/discover";
  };
  const activeFilters = [
    q && { key: "q" as const, label: `“${q}”` },
    game && { key: "game" as const, label: game },
    region && { key: "region" as const, label: region },
  ].filter(Boolean) as { key: "q" | "game" | "region"; label: string }[];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-2">
        <span className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
          <span className="h-px w-6 bg-accent-volt" aria-hidden />
          Discover
        </span>
        <h1 className="font-display text-[32px] leading-[0.95] font-bold tracking-tight sm:text-[44px]">
          {onTeams ? "Find a squad worth joining." : "Find a rival. Or a teammate."}
        </h1>
        <p className="max-w-xl text-[15px] text-muted">
          {onTeams
            ? "Teams recruiting on Circuit. Join one, or line up against them."
            : "Teammates, rivals and friends. Search by name, the games they play, or where they are."}
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <nav aria-label="Discover players or teams" className="grid w-full grid-cols-2 cut-sm [--cut-line:var(--border)] border border-border bg-surface p-1 sm:w-fit">
          {[
            { href: "/discover", label: "Players", count: playerCount, on: !onTeams },
            { href: "/discover?tab=teams", label: "Teams", count: teamCount, on: onTeams },
          ].map((t) => (
            <Link
              key={t.label}
              href={t.href}
              aria-current={t.on ? "page" : undefined}
              className={`flex items-center justify-center gap-2 rounded-none px-5 py-2 text-sm font-semibold transition ${
                t.on ? "bg-foreground text-background" : "text-muted hover:text-foreground"
              }`}
            >
              {t.label}
              <span className={`font-mono text-[11px] tabular-nums ${t.on ? "opacity-70" : "text-muted-strong"}`}>{t.count}</span>
            </Link>
          ))}
        </nav>

        <form className="flex flex-col gap-2 lg:flex-row">
          {onTeams && <input type="hidden" name="tab" value="teams" />}
          <label className="relative flex min-w-0 flex-1 items-center">
            <Search size={17} className="pointer-events-none absolute left-3.5 text-muted" />
            <span className="sr-only">{onTeams ? "Team name" : "Name or @handle"}</span>
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder={onTeams ? "Search teams by name" : "Search by name or @handle"}
              className="h-12 w-full cut-sm [--cut-line:var(--border)] border border-border bg-surface pr-4 pl-11 text-[15px] outline-none transition placeholder:text-muted-strong focus:border-border-strong"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto] lg:flex">
            {games.length > 0 ? (
              <select
                name="game"
                defaultValue={game ?? ""}
                aria-label="Game"
                className="field-select h-12 min-w-0 cut-sm [--cut-line:var(--border)] border-border bg-surface lg:w-44"
              >
                <option value="">Any game</option>
                {games.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name="game"
                defaultValue={game ?? ""}
                placeholder="Game"
                aria-label="Game"
                className="h-12 min-w-0 cut-sm [--cut-line:var(--border)] border border-border bg-surface px-4 text-sm outline-none focus:border-border-strong lg:w-40"
              />
            )}
            <label className="relative flex min-w-0 items-center">
              <MapPin size={15} className="pointer-events-none absolute left-3 text-muted" />
              <span className="sr-only">Region</span>
              <input
                name="region"
                defaultValue={region ?? ""}
                placeholder="City or state"
                className="h-12 w-full min-w-0 cut-sm [--cut-line:var(--border)] border border-border bg-surface pr-3 pl-9 text-sm outline-none placeholder:text-muted-strong focus:border-border-strong lg:w-40"
              />
            </label>
            <button type="submit" aria-label="Search" className="btn-primary col-span-2 h-12 w-full cut-sm p-0 sm:col-span-1 sm:w-12 lg:w-auto lg:px-5">
              <Search size={17} />
              <span className="sm:hidden lg:inline">Search</span>
            </button>
          </div>
        </form>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {activeFilters.map((f) => (
              <Link
                key={f.key}
                href={without(f.key)}
                className="flex items-center gap-1.5 rounded-full border border-border bg-surface py-1 pr-2 pl-3 text-[13px] font-medium transition hover:border-border-hover"
              >
                {f.label}
                <X size={13} className="text-muted" />
              </Link>
            ))}
            <Link href={base} className="text-[13px] font-medium text-muted transition hover:text-foreground">
              Clear all
            </Link>
          </div>
        )}
      </div>

      {onTeams ? (
        <TeamsTab viewerId={user.id} favoriteGames={user.favoriteGames} filters={{ q, game, region }} hasFilters={hasFilters} />
      ) : (
        <PlayersTab viewerId={user.id} handle={user.handle} filters={{ q, game, region }} hasFilters={hasFilters} />
      )}
    </div>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-center gap-3 cut-lg [--cut-line:var(--border)] border border-dashed border-border-strong px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center cut-sm bg-surface-elevated text-muted">
        <Users size={22} />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-[13px] leading-relaxed text-muted">{body}</p>
      </div>
      {action && (
        <Link href={action.href} className="btn-secondary mt-1 px-4 py-2 text-sm">
          {action.label}
        </Link>
      )}
    </div>
  );
}

async function PlayersTab({
  viewerId,
  handle,
  filters,
  hasFilters,
}: {
  viewerId: string;
  handle: string;
  filters: DiscoveryFilters;
  hasFilters: boolean;
}) {
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
        <DiscoverySectionRow key={section.key} title={section.title} count={section.players.length}>
          {section.players.map((player) => (
            <div key={player.id} className="w-[250px] shrink-0 snap-start">
              <PlayerDiscoveryCard player={player} />
            </div>
          ))}
        </DiscoverySectionRow>
      ))}

      <div className="flex flex-col gap-4">
        {sections.length > 0 && <h2 className="font-display text-lg font-bold tracking-tight">All players</h2>}
        {players.length === 0 ? (
          hasFilters ? (
            <EmptyState title="No one matches that search" body="Try a different game, a nearby city, or just part of a name." action={{ href: "/discover", label: "Clear search" }} />
          ) : (
            <EmptyState
              title="You're early"
              body="No other players are on Circuit yet. Share your profile with your squad so they can find you when they join."
              action={{ href: `/players/${handle}`, label: "View my profile" }}
            />
          )
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
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
        <DiscoverySectionRow title="Teams playing your games" count={recommended.length}>
          {recommended.map((team) => (
            <div key={team.id} className="w-[250px] shrink-0 snap-start">
              <TeamDiscoveryCard team={team} viewerId={viewerId} />
            </div>
          ))}
        </DiscoverySectionRow>
      )}

      <div className="flex flex-col gap-4">
        {recommended.length > 0 && <h2 className="font-display text-lg font-bold tracking-tight">All teams</h2>}
        {teams.length === 0 ? (
          hasFilters ? (
            <EmptyState title="No teams match that search" body="Try another game or region. Or start the team you were looking for." action={{ href: "/teams", label: "Start a team" }} />
          ) : (
            <EmptyState title="No teams yet" body="Be the first: start a team, set its game, and invite your squad." action={{ href: "/teams", label: "Start a team" }} />
          )
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
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
