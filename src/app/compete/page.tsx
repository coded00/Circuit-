/**
 * Circuit — Compete: the main tournament discovery/search page (MVP
 * rework spec section 18). Real, schema-backed filters only: search
 * (name text match), game, status (Open/Live/Completed), entry (Free/Paid,
 * via `entryFee`), type (brackets, league tables, lobby points, via the
 * structure), game mode (via `Tournament.teamSize`) and a sort. Filter
 * options come from real `distinct` queries against actual tournaments, so
 * they never go stale as organizers add games/modes.
 *
 * Layout: one featured competition up top (the busiest live one, else the
 * open one with the biggest prize) in a dark broadcast card, then the rest
 * grouped as Live now / Coming up / Finished, each row laid out like a
 * fixture: date, what it is, spots, prize. Status tabs, game chips and the
 * segmented filters are plain links, so every view has its own URL.
 */

import Link from "next/link";
import { ArrowRight, Search, Tv } from "lucide-react";
import type { Prisma, TournamentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ViewTransition } from "react";
import { GameArtTile } from "@/components/GameArtTile";
import { tournamentArtName } from "@/lib/viewTransitions";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";
import { Panel, PanelEmpty, PanelRows, panelRowClass } from "@/components/ui/Panel";
import { openDueTournaments } from "@/lib/tournaments";
import { tournamentPath } from "@/lib/seo";
import { FilterMenu } from "./FilterMenu";
import { competitionKind, formatsForType, pickFeatured, spotsLabel, timeUntil, TYPE_GROUPS } from "@/lib/competeView";

type SearchParams = {
  q?: string;
  game?: string;
  status?: string;
  entry?: string;
  teamSize?: string;
  type?: string;
  sort?: string;
  /** Prize pool bucket: under5k, 5k-20k, over20k. */
  prize?: string;
  /** Start window: 24h, week, month. */
  starts?: string;
  /** Who plays: solo or team (the tournament's entry type). */
  play?: string;
};

// Prize buckets are in kobo (₦1 = 100).
const PRIZE_BUCKETS: Record<string, { label: string; where: Prisma.IntNullableFilter }> = {
  under5k: { label: "Under ₦5,000", where: { gt: 0, lt: 500_000 } },
  "5k-20k": { label: "₦5,000 to ₦20,000", where: { gte: 500_000, lte: 2_000_000 } },
  over20k: { label: "Over ₦20,000", where: { gt: 2_000_000 } },
};
const START_WINDOWS: Record<string, { label: string; days: number }> = {
  "24h": { label: "Next 24 hours", days: 1 },
  week: { label: "Next 7 days", days: 7 },
  month: { label: "Next 30 days", days: 30 },
};

const STATUS_TABS: { value: TournamentStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "LIVE", label: "Live" },
  { value: "COMPLETE", label: "Completed" },
];

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

/** Same page, with some params changed (undefined/"" removes one). */
function hrefWith(current: SearchParams, changes: Partial<SearchParams>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...changes })) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `/compete?${qs}` : "/compete";
}

type Row = {
  id: string;
  name: string;
  game: string;
  status: TournamentStatus;
  format: string;
  leagueLegs: number | null;
  teamSize: string;
  entryFee: number;
  participantCap: number;
  streamUrl: string | null;
  startAt: Date;
  registrationCloseAt: Date;
  prizeAmount: number | null;
  posterUrl: string | null;
  registered: number;
  createdAt: Date;
};

/** One small square per spot for small fields, filled as people join; a plain count for big ones. */
function SlotPips({ registered, cap }: { registered: number; cap: number }) {
  if (cap > 16) {
    return (
      <span className="text-stat text-xs text-muted">
        {registered}/{cap}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-[3px]" aria-hidden>
      {Array.from({ length: cap }, (_, i) => (
        <span key={i} className={`h-3 w-1.5 rounded-[2px] ${i < registered ? "bg-foreground" : "bg-border-strong/60"}`} />
      ))}
    </span>
  );
}

/** "Free entry" / "₦500 entry". */
function entryText(t: Row): string {
  return t.entryFee === 0 ? "Free entry" : `${formatNaira(t.entryFee)} entry`;
}

function Prize({ t, size }: { t: Row; size: "row" | "feature" }) {
  const big = size === "feature";
  const value = t.prizeAmount ? formatNaira(t.prizeAmount) : t.entryFee === 0 ? "Free" : formatNaira(t.entryFee);
  const caption = t.prizeAmount ? "Prize pool" : "Entry";
  return (
    <div className={`flex flex-col ${big ? "items-start" : "items-end text-right"}`}>
      <span className={`font-display leading-none font-bold tabular-nums ${big ? "text-5xl sm:text-6xl" : "text-[22px]"} ${t.prizeAmount ? "text-gold" : t.entryFee === 0 ? "text-success" : ""}`}>{value}</span>
      <span className={`${big ? "mt-1.5 text-xs" : "mt-1 text-[11px]"} text-muted`}>
        {caption}
        {big && t.prizeAmount ? `, ${entryText(t)}` : ""}
      </span>
    </div>
  );
}

function Featured({ t }: { t: Row }) {
  const live = t.status === "LIVE";
  const closes = timeUntil(t.registrationCloseAt);
  const spots = spotsLabel(t.registered, t.participantCap);
  return (
    <section data-surface="dark" className="relative isolate overflow-hidden rounded-[var(--radius-hero)] border border-border bg-background">
      <ViewTransition name={tournamentArtName(t.id)} share="tournament-morph" default="none">
        <GameArtTile game={t.game} posterUrl={t.posterUrl} className="-z-20" hideLabel fill imgWidth={1200} />
      </ViewTransition>
      <div className="absolute inset-0 -z-10 bg-background/85 md:hidden" aria-hidden />
      <div className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-background from-35% via-background/95 via-60% to-background/25 md:block" aria-hidden />
      <div className="flex flex-col gap-7 p-6 sm:p-9 md:max-w-[62%]">
        <div className="flex flex-wrap items-center gap-2.5">
          {live ? (
            <StatusPill tone="live" pulse solid>
              Live now
            </StatusPill>
          ) : (
            <StatusPill tone="open" solid>
              Registration open
            </StatusPill>
          )}
          <span className="text-sm text-muted">
            {t.game}, {competitionKind(t)}
          </span>
        </div>
        <h2 className="font-display text-4xl leading-[0.95] font-bold tracking-tight uppercase sm:text-5xl">{t.name}</h2>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-5">
          <Prize t={t} size="feature" />
          <div className="flex flex-col gap-1.5 pb-0.5 text-sm">
            <span className="flex items-center gap-2.5">
              <SlotPips registered={t.registered} cap={t.participantCap} />
              <span className={spots.tight ? "font-semibold text-accent-orange" : "text-muted"}>{spots.text}</span>
            </span>
            {!live && closes && <span className={closes.urgent ? "font-semibold text-accent-orange" : "text-muted"}>Closes in {closes.text}</span>}
          </div>
        </div>
        <div>
          <Link href={tournamentPath(t)} className="btn-primary">
            {live ? "Follow it live" : "Enter now"}
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function CompetitionRow({ t }: { t: Row }) {
  const statusInfo = tournamentStatusInfo(t.status);
  const live = t.status === "LIVE";
  const finished = t.status === "COMPLETE" || t.status === "CANCELLED";
  const closes = t.status === "OPEN" ? timeUntil(t.registrationCloseAt) : null;
  const spots = spotsLabel(t.registered, t.participantCap);
  const tight = spots.tight && t.status === "OPEN";
  const day = t.startAt.toLocaleDateString("en-NG", { day: "numeric" });
  const month = t.startAt.toLocaleDateString("en-NG", { month: "short" });
  const time = t.startAt.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
  return (
    <Link href={tournamentPath(t)} className={`${panelRowClass} gap-4 py-4 ${finished ? "opacity-85" : ""}`}>
      <div className="flex w-12 shrink-0 flex-col items-center leading-none">
        {live ? (
          <span className="flex flex-col items-center gap-1.5 text-live">
            <span className="pulse-dot" aria-hidden />
            <span className="text-[10px] font-bold tracking-wide uppercase">Live</span>
          </span>
        ) : (
          <>
            <span className="font-display text-[28px] font-bold tabular-nums">{day}</span>
            <span className="mt-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{month}</span>
            <span className="mt-1 text-[10px] text-muted tabular-nums">{time}</span>
          </>
        )}
      </div>

      <ViewTransition name={tournamentArtName(t.id)} share="tournament-morph" default="none">
        <GameArtTile game={t.game} posterUrl={t.posterUrl} className="hidden h-12 w-12 shrink-0 rounded-[10px] sm:block" hideLabel imgWidth={160} />
      </ViewTransition>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px] font-semibold">{t.name}</span>
          {t.streamUrl && <Tv size={13} className="shrink-0 text-muted" aria-label="Streamed" />}
        </div>
        <span className="text-metadata truncate">
          {t.game}, {competitionKind(t)}
          {t.teamSize ? `, ${t.teamSize}` : ""}
          {t.prizeAmount ? <span className="lg:hidden">, {entryText(t)}</span> : null}
        </span>
        <span className="flex items-center gap-2 md:hidden">
          <SlotPips registered={t.registered} cap={t.participantCap} />
          <span className={`text-[11px] ${tight ? "font-semibold text-accent-orange" : "text-muted"}`}>{spots.text}</span>
        </span>
      </div>

      <div className="hidden w-40 shrink-0 flex-col gap-1.5 md:flex">
        <SlotPips registered={t.registered} cap={t.participantCap} />
        <span className={`text-xs ${tight ? "font-semibold text-accent-orange" : "text-muted"}`}>{spots.text}</span>
      </div>

      <div className="w-24 shrink-0 sm:w-28">
        <Prize t={t} size="row" />
      </div>

      <div className="hidden w-36 shrink-0 flex-col items-end gap-1 text-right lg:flex">
        {closes ? (
          <span className={`text-xs ${closes.urgent ? "font-semibold text-accent-orange" : "text-muted"}`}>Closes in {closes.text}</span>
        ) : live ? (
          <StatusPill tone={statusInfo.tone} pulse={statusInfo.pulse}>
            {statusInfo.label}
          </StatusPill>
        ) : (
          <span className="text-xs text-muted">{finished ? (t.status === "CANCELLED" ? "Cancelled" : "Finished") : statusInfo.label}</span>
        )}
        {t.prizeAmount ? <span className="text-[11px] text-muted">{entryText(t)}</span> : null}
      </div>
      <ArrowRight size={15} className="hidden shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground sm:block" />
    </Link>
  );
}

export default async function CompetePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await openDueTournaments();
  const current = await searchParams;
  const { q, game, status, entry, teamSize, type, sort, prize, starts, play } = current;

  const where: Prisma.TournamentWhereInput = {};
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (game) where.game = { contains: game, mode: "insensitive" };
  if (status) where.status = status as TournamentStatus;
  if (entry === "free") where.entryFee = 0;
  if (entry === "paid") where.entryFee = { gt: 0 };
  if (teamSize) where.teamSize = teamSize;
  if (prize && PRIZE_BUCKETS[prize]) where.prizeAmount = PRIZE_BUCKETS[prize].where;
  if (starts && START_WINDOWS[starts]) {
    const from = new Date();
    where.startAt = { gte: from, lte: new Date(from.getTime() + START_WINDOWS[starts].days * 24 * 60 * 60 * 1000) };
  }
  if (play === "solo") where.entryType = "INDIVIDUAL";
  if (play === "team") where.entryType = "TEAM";
  const typeFormats = formatsForType(type);
  if (typeFormats) where.format = { in: [...typeFormats] };

  const [teamSizeRows, gameRows, liveCount, openCount, found] = await Promise.all([
    prisma.tournament.findMany({ distinct: ["teamSize"], select: { teamSize: true }, orderBy: { teamSize: "asc" } }),
    prisma.tournament.groupBy({
      by: ["game"],
      where: { status: { in: ["OPEN", "LIVE", "DRAFT"] } },
      _count: { _all: true },
      orderBy: { _count: { game: "desc" } },
      take: 10,
    }),
    prisma.tournament.count({ where: { status: "LIVE" } }),
    prisma.tournament.count({ where: { status: "OPEN" } }),
    prisma.tournament.findMany({
      where,
      orderBy: { startAt: "asc" },
      take: 40,
      select: {
        id: true,
        name: true,
        game: true,
        status: true,
        format: true,
        leagueLegs: true,
        teamSize: true,
        entryFee: true,
        participantCap: true,
        streamUrl: true,
        startAt: true,
        registrationCloseAt: true,
        prizeAmount: true,
        posterUrl: true,
        createdAt: true,
        _count: { select: { registrations: { where: { status: "CONFIRMED" } } } },
      },
    }),
  ]);

  const tournaments: Row[] = found.map(({ _count, ...t }) => ({ ...t, registered: _count.registrations }));

  // Live first, then everything upcoming by soonest start, then finished
  // ones most-recent first. "Biggest prize" reorders within each of those.
  const rank = (s: TournamentStatus) => (s === "LIVE" ? 0 : s === "COMPLETE" || s === "CANCELLED" ? 2 : 1);
  tournaments.sort((a, b) => {
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    if (sort === "prize") {
      const p = (b.prizeAmount ?? 0) - (a.prizeAmount ?? 0);
      if (p !== 0) return p;
    }
    if (sort === "players" && b.registered !== a.registered) return b.registered - a.registered;
    if (sort === "new") return b.createdAt.getTime() - a.createdAt.getTime();
    return rank(a.status) === 2 ? b.startAt.getTime() - a.startAt.getTime() : a.startAt.getTime() - b.startAt.getTime();
  });

  const hasFilters = Boolean(q || game || status || entry || teamSize || type || prize || starts || play);
  // Lead with one competition unless they're searching for something in particular or browsing finished ones.
  const featured = !q && (!status || status === "OPEN" || status === "LIVE") ? pickFeatured(tournaments) : null;
  const rest = featured ? tournaments.filter((t) => t.id !== featured.id) : tournaments;
  const groups = [
    { key: "live", title: "Live now", rows: rest.filter((t) => t.status === "LIVE") },
    { key: "soon", title: "Coming up", rows: rest.filter((t) => rank(t.status) === 1) },
    { key: "done", title: "Finished", rows: rest.filter((t) => rank(t.status) === 2) },
  ].filter((g) => g.rows.length > 0);

  const menu = (label: string, key: keyof SearchParams, options: { value: string; label: string }[], align: "start" | "end" = "start") => (
    <FilterMenu
      label={label}
      align={align}
      active={current[key] ?? ""}
      options={options.map((o) => ({ ...o, href: hrefWith(current, { [key]: o.value || undefined }) }))}
    />
  );
  const filterControls = (
    <div className="flex flex-wrap items-center gap-2">
      {menu("Entry", "entry", [
        { value: "", label: "Any entry" },
        { value: "free", label: "Free" },
        { value: "paid", label: "Paid" },
      ])}
      {menu("Players", "play", [
        { value: "", label: "Solo or team" },
        { value: "solo", label: "Solo" },
        { value: "team", label: "Team" },
      ])}
      {menu("Prize", "prize", [{ value: "", label: "Any prize" }, ...Object.entries(PRIZE_BUCKETS).map(([value, b]) => ({ value, label: b.label }))])}
      {menu("Starts", "starts", [{ value: "", label: "Any date" }, ...Object.entries(START_WINDOWS).map(([value, w]) => ({ value, label: w.label }))])}
      {menu("Type", "type", [{ value: "", label: "Any type" }, ...TYPE_GROUPS.map((g) => ({ value: g.value, label: g.label }))])}
      {teamSizeRows.length > 1 && teamSizeRows.length <= 8 && menu("Mode", "teamSize", [{ value: "", label: "Any mode" }, ...teamSizeRows.map((r) => ({ value: r.teamSize, label: r.teamSize }))])}
      {hasFilters && (
        <Link href="/compete" className="px-1 text-xs font-medium text-accent-blue hover:underline">
          Clear filters
        </Link>
      )}
    </div>
  );
  const sortControl = menu(
    "Sort",
    "sort",
    [
      { value: "", label: "Soonest first" },
      { value: "prize", label: "Biggest prize" },
      { value: "players", label: "Most players" },
      { value: "new", label: "Recently added" },
    ],
    "end"
  );

  const chipClass = (active: boolean) =>
    `flex shrink-0 items-center rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
      active ? "bg-foreground text-background" : "bg-surface-elevated text-muted hover:text-foreground"
    }`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-3xl leading-none font-bold tracking-tight uppercase sm:text-4xl">Compete</h1>
          <p className="text-sm text-muted">
            {liveCount > 0 && (
              <>
                <span className="text-stat text-live">{liveCount}</span> live now,{" "}
              </>
            )}
            <span className="text-stat text-foreground">{openCount}</span> open for registration
          </p>
        </div>
        <form className="relative flex w-full items-center sm:w-72">
          {status && <input type="hidden" name="status" value={status} />}
          {game && <input type="hidden" name="game" value={game} />}
          {entry && <input type="hidden" name="entry" value={entry} />}
          {teamSize && <input type="hidden" name="teamSize" value={teamSize} />}
          {type && <input type="hidden" name="type" value={type} />}
          {sort && <input type="hidden" name="sort" value={sort} />}
          {prize && <input type="hidden" name="prize" value={prize} />}
          {starts && <input type="hidden" name="starts" value={starts} />}
          {play && <input type="hidden" name="play" value={play} />}
          <Search size={16} className="pointer-events-none absolute left-3.5 text-muted" />
          <span className="sr-only">Search tournaments</span>
          <input type="search" name="q" defaultValue={q ?? ""} placeholder="Search by name" className="field-input w-full pl-10" />
        </form>
      </header>

      <div className="flex flex-col gap-4">
        <div role="tablist" aria-label="Tournament status" className="tabs scrollbar-hide overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const active = (status ?? "") === tab.value;
            return (
              <Link
                key={tab.label}
                role="tab"
                aria-selected={active}
                href={hrefWith(current, { status: tab.value || undefined })}
                className={`tab shrink-0 py-3 ${active ? "tab-active" : ""}`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {gameRows.length > 1 && (
          <nav aria-label="Filter by game" className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <Link href={hrefWith(current, { game: undefined })} className={chipClass(!game)}>
              All games
            </Link>
            {gameRows.map((row) => {
              const active = game?.toLowerCase() === row.game.toLowerCase();
              return (
                <Link key={row.game} href={hrefWith(current, { game: active ? undefined : row.game })} className={chipClass(active)}>
                  {row.game}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {filterControls}
          {sortControl}
        </div>
      </div>

      {/* Filter/tab links keep the pathname, so the page stays put and only
          the results crossfade (keyed by the active filters). */}
      <ViewTransition key={JSON.stringify(current)} name="compete-results" share="content-swap" enter="content-swap" default="none">
        <div className="flex flex-col gap-6">
          {featured && <Featured t={featured} />}

          {tournaments.length === 0 ? (
            <Panel title="Results">
              <PanelEmpty>
                {hasFilters ? (
                  <>
                    Nothing matches those filters.{" "}
                    <Link href="/compete" className="font-medium text-accent-blue hover:underline">
                      Show everything
                    </Link>
                  </>
                ) : (
                  <>
                    No competitions yet.{" "}
                    <Link href="/tournaments/new" className="font-medium text-accent-blue hover:underline">
                      Host the first one
                    </Link>
                  </>
                )}
              </PanelEmpty>
            </Panel>
          ) : (
            groups.map((g) => (
              <Panel key={g.key} title={g.title} meta={g.rows.length}>
                <PanelRows>
                  {g.rows.map((t) => (
                    <CompetitionRow key={t.id} t={t} />
                  ))}
                </PanelRows>
              </Panel>
            ))
          )}
        </div>
      </ViewTransition>
    </div>
  );
}
