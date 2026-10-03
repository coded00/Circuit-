/**
 * Circuit — Communities: the directory, modelled on how Discord's server
 * discovery works but ranked for a small, growing platform.
 *
 * - "Your communities" first (with unread counts), for jumping back in.
 * - "Which games do you play?" onboarding until you're in a game hub.
 * - Search + filters (game, city/state, sort), GET-searchParams like /discover.
 * - Unfiltered: official game hubs, near you, most active this week, new.
 *
 * Public: guests can browse (it's where shared links land); joining asks
 * them to log in. Invite-only communities are never listed.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Compass, MapPin, Plus, Search, X } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getJoinedCommunities, getOrCreateGlobalCommunity, type JoinedCommunity } from "@/lib/community";
import { discoverCommunities, ensureGameHubs, ensureOfficialCommunities, getDiscoveryHome, type CommunityCard as CardData, type DiscoverSort } from "@/lib/communityDirectory";
import { signupPath } from "@/lib/safeRedirect";
import { COMMUNITY_CATEGORIES } from "@/lib/communityRules";
import { CommunityCard } from "@/components/community/CommunityCard";
import { CommunityAvatar } from "@/components/community/CommunityAvatar";
import { PickYourGames } from "@/components/community/PickYourGames";
import { DiscoverySectionRow } from "@/components/discover/DiscoverySectionRow";

export const metadata: Metadata = {
  title: "Communities",
  description: "Find your scene on Circuit. Official game hubs, campus crews and city communities for Nigerian gamers.",
};

type SearchParams = { q?: string; game?: string; region?: string; sort?: string; category?: string };

const SORTS: { value: DiscoverSort; label: string }[] = [
  { value: "active", label: "Most active" },
  { value: "new", label: "Newest" },
  { value: "members", label: "Most members" },
];

export default async function CommunitiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const user = await getCurrentUser();
  const { q, game, region } = params;
  const category = COMMUNITY_CATEGORIES.find((c) => c.value === params.category)?.value;
  const sort: DiscoverSort = SORTS.some((s) => s.value === params.sort) ? (params.sort as DiscoverSort) : "active";
  const hasFilters = !!(q || game || region || params.sort || category);

  const viewerId = user?.id ?? "";
  const loadListings = () =>
    Promise.all([
      hasFilters ? null : getDiscoveryHome({ id: viewerId, region: user?.region ?? null }),
      hasFilters ? discoverCommunities(viewerId, { q, game, region, category, sort }) : null,
    ]);
  const [created, joined, games, listings] = await Promise.all([
    // Never let hub bookkeeping take the directory down.
    Promise.all([ensureGameHubs(), ensureOfficialCommunities(), getOrCreateGlobalCommunity()]).then(([a, b]) => a + b).catch(() => 0),
    user ? getJoinedCommunities(user.id) : Promise.resolve([] as JoinedCommunity[]),
    prisma.game.findMany({ where: { enabled: true, publishedAt: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, iconUrl: true } }),
    loadListings(),
  ]);
  // A newly published game just got its hub — reload so it shows now.
  const [home, results] = created > 0 ? await loadListings() : listings;
  const hubMemberships = joined.filter((c) => c.kind === "GAME_HUB").length;

  const without = (key: keyof SearchParams) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, game, region, sort: params.sort, category })) if (v && k !== key) next.set(k, v);
    const qs = next.toString();
    return qs ? `/communities?${qs}` : "/communities";
  };
  const activeFilters = [
    q && { key: "q" as const, label: `“${q}”` },
    game && { key: "game" as const, label: game },
    region && { key: "region" as const, label: region },
    params.sort && { key: "sort" as const, label: SORTS.find((s) => s.value === sort)!.label },
    category && { key: "category" as const, label: COMMUNITY_CATEGORIES.find((c) => c.value === category)!.label },
  ].filter(Boolean) as { key: keyof SearchParams; label: string }[];

  const createHref = user ? "/communities/new" : signupPath("/communities/new");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
            <span className="h-px w-6 bg-accent-volt" aria-hidden />
            Communities
          </span>
          <h1 className="font-display text-[32px] leading-[0.95] font-bold tracking-tight sm:text-[44px]">Find the ones worth facing.</h1>
          <p className="max-w-xl text-[15px] text-muted">Official game hubs, campus crews and city squads. Join the conversation, or start your own.</p>
        </div>
        <Link href={createHref} className="btn-primary h-11 shrink-0 gap-1.5 px-5">
          <Plus size={16} /> Create community
        </Link>
      </header>

      {joined.length > 0 && <YourCommunities communities={joined} />}

      {user && !user.onboardedAt && !hasFilters && (
        <Link
          href="/welcome?next=%2Fcommunities"
          className="flex items-center gap-3 cut-lg [--cut-line:var(--border)] border border-border bg-surface p-4 transition hover:border-border-hover"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center cut-sm bg-accent-volt text-accent-volt-foreground">
            <Compass size={18} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold">Finish setting up</span>
            <span className="text-[13px] text-muted">Tell us your games, city and interests. We&apos;ll pick communities for you.</span>
          </span>
          <span className="text-sm font-semibold text-accent-blue">Start →</span>
        </Link>
      )}

      {user && user.onboardedAt && hubMemberships === 0 && games.length > 0 && !hasFilters && (
        <PickYourGames games={games} preselected={games.filter((g) => user.favoriteGames.includes(g.name)).map((g) => g.id)} />
      )}

      <div className="flex flex-col gap-3">
        <nav aria-label="Categories" className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ value: undefined, label: "All" }, ...COMMUNITY_CATEGORIES].map((c) => {
            const next = new URLSearchParams();
            for (const [k, v] of Object.entries({ q, game, region, sort: params.sort })) if (v) next.set(k, v);
            if (c.value) next.set("category", c.value);
            const on = category === c.value;
            return (
              <Link
                key={c.label}
                href={next.toString() ? `/communities?${next}` : "/communities"}
                aria-current={on ? "page" : undefined}
                className={`flex h-9 shrink-0 items-center cut-xs border px-3.5 text-sm font-semibold transition ${
                  on ? "border-foreground bg-foreground text-background" : "border-border bg-surface hover:border-border-hover"
                }`}
              >
                {c.label}
              </Link>
            );
          })}
        </nav>
        <form className="flex flex-col gap-2 lg:flex-row">
          {category && <input type="hidden" name="category" value={category} />}
          <label className="relative flex min-w-0 flex-1 items-center">
            <Search size={17} className="pointer-events-none absolute left-3.5 text-muted" />
            <span className="sr-only">Search communities</span>
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search by name, topic or tag"
              className="h-12 w-full cut-sm [--cut-line:var(--border)] border border-border bg-surface pr-4 pl-11 text-[15px] outline-none transition placeholder:text-muted-strong focus:border-border-strong"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
            <select name="game" defaultValue={game ?? ""} aria-label="Game" className="field-select h-12 min-w-0 cut-sm [--cut-line:var(--border)] border-border bg-surface lg:w-40">
              <option value="">Any game</option>
              {games.map((g) => (
                <option key={g.id} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
            <label className="relative flex min-w-0 items-center">
              <MapPin size={15} className="pointer-events-none absolute left-3 text-muted" />
              <span className="sr-only">City or state</span>
              <input
                name="region"
                defaultValue={region ?? ""}
                placeholder="City or state"
                className="h-12 w-full min-w-0 cut-sm [--cut-line:var(--border)] border border-border bg-surface pr-3 pl-9 text-sm outline-none placeholder:text-muted-strong focus:border-border-strong lg:w-36"
              />
            </label>
            <select name="sort" defaultValue={params.sort ?? ""} aria-label="Sort" className="field-select h-12 min-w-0 cut-sm [--cut-line:var(--border)] border-border bg-surface lg:w-36">
              <option value="">Most active</option>
              {SORTS.slice(1).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-primary h-12 gap-1.5 cut-sm sm:px-5">
              <Search size={17} />
              Search
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
            <Link href="/communities" className="text-[13px] font-medium text-muted transition hover:text-foreground">
              Clear all
            </Link>
          </div>
        )}
      </div>

      {results ? (
        results.length === 0 ? (
          <EmptyState title="Nothing matches that yet" body="Try another game or a nearby city. Or start the community you were looking for." action={{ href: createHref, label: "Create community" }} />
        ) : (
          <Grid cards={results} />
        )
      ) : (
        home && (
          <div className="flex flex-col gap-9">
            {home.hubs.length > 0 && (
              <DiscoverySectionRow title="Circuit & game hubs" count={home.hubs.length}>
                {home.hubs.map((c) => (
                  <div key={c.id} className="w-[260px] shrink-0 snap-start">
                    <CommunityCard community={c} />
                  </div>
                ))}
              </DiscoverySectionRow>
            )}
            {home.cities.length > 0 && (
              <DiscoverySectionRow title="Cities" count={home.cities.length}>
                {home.cities.map((c) => (
                  <div key={c.id} className="w-[260px] shrink-0 snap-start">
                    <CommunityCard community={c} />
                  </div>
                ))}
              </DiscoverySectionRow>
            )}
            {home.interests.length > 0 && (
              <DiscoverySectionRow title="Interests" count={home.interests.length}>
                {home.interests.map((c) => (
                  <div key={c.id} className="w-[260px] shrink-0 snap-start">
                    <CommunityCard community={c} />
                  </div>
                ))}
              </DiscoverySectionRow>
            )}
            {home.nearYou.length > 0 && (
              <DiscoverySectionRow title={`Near ${user?.region ?? "you"}`} count={home.nearYou.length}>
                {home.nearYou.map((c) => (
                  <div key={c.id} className="w-[260px] shrink-0 snap-start">
                    <CommunityCard community={c} />
                  </div>
                ))}
              </DiscoverySectionRow>
            )}
            {home.active.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="font-display text-lg font-bold tracking-tight">Most active this week</h2>
                <Grid cards={home.active} />
              </section>
            )}
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-bold tracking-tight">New communities</h2>
              {home.newest.length > 0 ? (
                <Grid cards={home.newest} />
              ) : (
                <EmptyState
                  title="No player communities yet"
                  body="Start one for your campus, your city or your squad. Share the invite link on WhatsApp and bring everyone in."
                  action={{ href: createHref, label: "Create the first one" }}
                />
              )}
            </section>
          </div>
        )
      )}
    </div>
  );
}

function Grid({ cards }: { cards: CardData[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((c) => (
        <CommunityCard key={c.id} community={c} />
      ))}
    </div>
  );
}

function YourCommunities({ communities }: { communities: JoinedCommunity[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-lg font-bold tracking-tight">Your communities</h2>
        <span className="font-mono text-xs text-muted-strong tabular-nums">{communities.length}</span>
      </div>
      <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {communities.map((c) => (
          <Link
            key={c.id}
            href={c.href}
            className="flex w-[220px] shrink-0 items-center gap-3 cut-sm [--cut-line:var(--border)] border border-border bg-surface p-2.5 transition hover:border-border-hover sm:w-[250px]"
          >
            <CommunityAvatar name={c.title} iconUrl={c.iconUrl} tag={c.tag} size="md" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">{c.title}</span>
              <span className="truncate text-xs text-muted">{c.subtitle}</span>
            </span>
            {c.unreadCount > 0 && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center cut-xs bg-live px-1.5 font-mono text-[11px] font-semibold text-white">
                {c.unreadCount > 99 ? "99+" : c.unreadCount}
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-center gap-3 cut-lg [--cut-line:var(--border)] border border-dashed border-border-strong px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center cut-sm bg-surface-elevated text-muted">
        <Compass size={22} />
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
