/**
 * Circuit — Compete: the main tournament discovery/search page (MVP
 * rework spec section 18). Real, schema-backed filters only: search
 * (name text match), game, status (Open/Live/Completed — reusing
 * `tournamentStatusInfo`), entry type (Free/Paid, via `entryFee`), and
 * game mode (via `Tournament.teamSize` — the organizer-picked real mode
 * for that specific competition, see `gameFormats.ts`). Filter options
 * come from real `distinct` queries against actual tournaments, not
 * hardcoded lists, so they never go stale as organizers add games/modes.
 *
 * Layout: status tabs and game chips are links (one tap, no form), the
 * search/entry/mode row is a small GET form, and results are a scannable
 * list — poster, name, game · mode, date, slots, prize/entry — rather
 * than a grid of tiny cards.
 */

import Link from "next/link";
import { ArrowRight, Calendar, Search, Tv } from "lucide-react";
import type { Prisma, TournamentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { GameArtTile } from "@/components/GameArtTile";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";
import { Panel, PanelEmpty, PanelRows, panelRowClass } from "@/components/ui/Panel";
import { openDueTournaments } from "@/lib/tournaments";
import { tournamentPath } from "@/lib/seo";

type SearchParams = {
  q?: string;
  game?: string;
  status?: string;
  entry?: string;
  teamSize?: string;
};

const STATUS_TABS: { value: TournamentStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "LIVE", label: "Live" },
  { value: "COMPLETE", label: "Completed" },
];

function formatDate(date: Date): string {
  return date.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

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

export default async function CompetePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await openDueTournaments();
  const current = await searchParams;
  const { q, game, status, entry, teamSize } = current;

  const where: Prisma.TournamentWhereInput = {};
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (game) where.game = { contains: game, mode: "insensitive" };
  if (status) where.status = status as TournamentStatus;
  if (entry === "free") where.entryFee = 0;
  if (entry === "paid") where.entryFee = { gt: 0 };
  if (teamSize) where.teamSize = teamSize;

  const [teamSizeRows, gameRows, liveCount, openCount, tournaments] = await Promise.all([
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
        teamSize: true,
        entryFee: true,
        participantCap: true,
        streamUrl: true,
        startAt: true,
        prizeAmount: true,
        posterUrl: true,
        _count: { select: { registrations: { where: { status: "CONFIRMED" } } } },
      },
    }),
  ]);

  const hasFilters = Boolean(q || game || status || entry || teamSize);
  const chipClass = (active: boolean) =>
    `flex shrink-0 items-center rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
      active ? "bg-foreground text-background" : "bg-surface-elevated text-muted hover:text-foreground"
    }`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-3xl leading-none font-bold tracking-tight uppercase sm:text-4xl">Compete</h1>
        <p className="text-sm text-muted">
          {liveCount > 0 && (
            <>
              <span className="text-stat text-live">{liveCount}</span> live now ·{" "}
            </>
          )}
          <span className="text-stat text-foreground">{openCount}</span> open for registration
        </p>
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

        <form className="flex flex-wrap items-center gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          {game && <input type="hidden" name="game" value={game} />}
          <label className="relative flex w-full min-w-0 items-center sm:w-auto sm:flex-1">
            <Search size={16} className="pointer-events-none absolute left-3.5 text-muted" />
            <span className="sr-only">Search tournaments</span>
            <input type="search" name="q" defaultValue={q ?? ""} placeholder="Search tournaments" className="field-input w-full pl-10" />
          </label>
          <select name="entry" defaultValue={entry ?? ""} aria-label="Entry" className="field-select min-w-0 flex-1 sm:w-auto sm:flex-none">
            <option value="">Any entry</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>
          <select name="teamSize" defaultValue={teamSize ?? ""} aria-label="Game mode" className="field-select min-w-0 flex-1 sm:w-auto sm:flex-none">
            <option value="">Any mode</option>
            {teamSizeRows.map((row) => (
              <option key={row.teamSize} value={row.teamSize}>
                {row.teamSize}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary flex-none">
            Search
          </button>
        </form>

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
      </div>

      <Panel
        title={hasFilters ? "Results" : "All competitions"}
        meta={tournaments.length || undefined}
        action={
          hasFilters ? (
            <Link href="/compete" className="text-xs font-medium text-accent-blue hover:underline">
              Clear filters
            </Link>
          ) : undefined
        }
      >
        {tournaments.length === 0 ? (
          <PanelEmpty>No competitions match those filters.</PanelEmpty>
        ) : (
          <PanelRows>
            {tournaments.map((t) => {
              const statusInfo = tournamentStatusInfo(t.status);
              const registered = t._count.registrations;
              const fill = t.participantCap > 0 ? Math.min(100, (registered / t.participantCap) * 100) : 0;
              const full = registered >= t.participantCap;
              return (
                <Link key={t.id} href={tournamentPath(t)} className={`${panelRowClass} py-3.5`}>
                  <GameArtTile
                    game={t.game}
                    posterUrl={t.posterUrl}
                    className="h-12 w-16 shrink-0 rounded-[10px] sm:h-16 sm:w-28"
                    hideLabel
                    imgWidth={240}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-semibold sm:text-[15px]">{t.name}</span>
                      {t.streamUrl && <Tv size={13} className="shrink-0 text-muted" aria-label="Streamed" />}
                    </div>
                    <span className="text-metadata truncate">
                      {t.game} · {t.teamSize}
                      {t.prizeAmount ? ` · ${t.entryFee === 0 ? "Free entry" : `${formatNaira(t.entryFee)} entry`}` : ""}
                    </span>
                    <span className="text-metadata flex items-center gap-1 sm:hidden">
                      <Calendar size={11} />
                      {formatDate(t.startAt)}
                    </span>
                  </div>

                  <div className="hidden w-36 shrink-0 flex-col gap-1 md:flex">
                    <span className="text-metadata flex items-center gap-1">
                      <Calendar size={11} />
                      {formatDate(t.startAt)}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-elevated" aria-hidden>
                        <div className={`h-full rounded-full ${full ? "bg-accent-orange" : "bg-accent-blue"}`} style={{ width: `${fill}%` }} />
                      </div>
                      <span className="text-stat text-[11px] text-muted">
                        {registered}/{t.participantCap}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-0.5 sm:w-28">
                    <span className={`text-stat text-sm ${t.prizeAmount ? "text-gold" : t.entryFee === 0 ? "text-success" : ""}`}>
                      {t.prizeAmount ? formatNaira(t.prizeAmount) : t.entryFee === 0 ? "Free" : formatNaira(t.entryFee)}
                    </span>
                    <span className="text-[11px] text-muted">{t.prizeAmount ? "Prize" : "Entry"}</span>
                  </div>

                  <div className="hidden w-24 shrink-0 justify-end lg:flex">
                    <StatusPill tone={statusInfo.tone} pulse={statusInfo.pulse}>
                      {statusInfo.label}
                    </StatusPill>
                  </div>
                  <ArrowRight size={15} className="hidden shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground sm:block" />
                </Link>
              );
            })}
          </PanelRows>
        )}
      </Panel>
    </div>
  );
}
