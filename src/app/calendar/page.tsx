/**
 * Circuit — Calendar. All real, schema-backed events in one browsable
 * grid, four kinds: Tournaments (dated by real `startAt`), Challenges
 * (still-OPEN Battles, dated by real `createdAt` — Battle has no
 * scheduled future date, it's an instant first-come-first-served
 * challenge, so "when it appeared" is the only honest date), and now
 * Community/Game Release — real, admin-authored `CalendarEvent` rows
 * (Admin > Calendar > Create Event). Those two used to be disabled,
 * "Soon" tabs because no real backing data existed for them at all; see
 * `./components/calendar/types.ts` for the full breakdown of what each
 * kind is grounded in.
 *
 * URL-is-the-state, same model `/compete`'s filter form already uses:
 * `y`/`m` (visible month), `view` (month/week/list), `type` (all/
 * tournaments/challenges/community/game_releases), `game` (free-text-ish
 * filter over the small curated GAME_ACTIVITY set — only meaningful for
 * Tournament/Challenge rows, Community/Game Release have no `game`
 * field), `day` (the day selected in the side panel / week anchor).
 * Every link on this page is a plain server-rendered navigation; the
 * only client component is the auto-submitting game `<select>`.
 *
 * All four kinds are always fetched (each capped at 200) and the type
 * filter is applied in memory, so every filter chip can show its real
 * count for the month — the chips double as the colour legend.
 */

import { ViewTransition } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { GAME_ACTIVITY } from "@/lib/circuitActivity";
import {
  addMonths,
  dateKey,
  endOfDay,
  getMonthGridDays,
  getWeekDays,
  MONTH_LABELS,
  parseDateKey,
  startOfDay,
} from "@/lib/calendar";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { CalendarDayPanel } from "@/components/calendar/CalendarDayPanel";
import { CalendarListView } from "@/components/calendar/CalendarListView";
import { GameFilterSelect } from "@/components/calendar/GameFilterSelect";
import { FeaturedCompetitions } from "@/components/FeaturedCompetitions";
import { EVENT_KIND_META, type CalendarEvent, type EventKind } from "@/components/calendar/types";

type SearchParams = {
  y?: string;
  m?: string;
  view?: string;
  type?: string;
  game?: string;
  day?: string;
};

type ViewMode = "month" | "week" | "list";
type EventType = "all" | "tournaments" | "challenges" | "community" | "game_releases";

const TYPE_TABS: { value: Exclude<EventType, "all">; kind: EventKind }[] = [
  { value: "tournaments", kind: "tournament" },
  { value: "challenges", kind: "challenge" },
  { value: "community", kind: "community" },
  { value: "game_releases", kind: "game_release" },
];

function formatCompactNaira(kobo: number): string {
  const naira = kobo / 100;
  if (naira >= 1_000_000) return `₦${(naira / 1_000_000).toFixed(naira >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (naira >= 1_000) return `₦${Math.round(naira / 1_000)}k`;
  return `₦${naira.toLocaleString("en-NG")}`;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const now = new Date();
  const todayKey = dateKey(now);

  const yNum = Number(sp.y);
  const mNum = Number(sp.m);
  const year = Number.isInteger(yNum) && yNum > 0 ? yNum : now.getFullYear();
  const month = Number.isInteger(mNum) && mNum >= 1 && mNum <= 12 ? mNum : now.getMonth() + 1;
  const view: ViewMode = sp.view === "week" || sp.view === "list" ? sp.view : "month";
  const type: EventType =
    sp.type === "tournaments" || sp.type === "challenges" || sp.type === "community" || sp.type === "game_releases"
      ? sp.type
      : "all";
  const game = sp.game?.trim() ?? "";

  const defaultSelected = year === now.getFullYear() && month === now.getMonth() + 1 ? todayKey : dateKey(new Date(year, month - 1, 1));
  const selectedKey = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : defaultSelected;
  const selectedDate = parseDateKey(selectedKey);

  // A trailing week made entirely of next month's days is just empty
  // hatching — drop it rather than always rendering six rows.
  const fullGrid = getMonthGridDays(year, month);
  const gridDays = fullGrid.slice(35).every((d) => d.getMonth() + 1 !== month) ? fullGrid.slice(0, 35) : fullGrid;
  const weekDays = getWeekDays(selectedDate);
  const rangeStart = startOfDay(gridDays[0]);
  const rangeEnd = endOfDay(gridDays[gridDays.length - 1]);

  const [tournaments, battles, communityEvents, gameReleaseEvents] = await Promise.all([
    prisma.tournament.findMany({
          where: {
            startAt: { gte: rangeStart, lte: rangeEnd },
            ...(game ? { game: { contains: game, mode: "insensitive" as const } } : {}),
          },
          orderBy: { startAt: "asc" },
          take: 200,
          select: {
            id: true,
            name: true,
            game: true,
            status: true,
            format: true,
            teamSize: true,
            entryFee: true,
            participantCap: true,
            startAt: true,
            prizeAmount: true,
            prizeText: true,
            posterUrl: true,
            _count: { select: { registrations: { where: { status: "CONFIRMED" as const } } } },
          },
        }),
    prisma.battle.findMany({
          where: {
            createdAt: { gte: rangeStart, lte: rangeEnd },
            status: "OPEN" as const,
            ...(game ? { game: { contains: game, mode: "insensitive" as const } } : {}),
          },
          orderBy: { createdAt: "asc" },
          take: 200,
          select: {
            id: true,
            game: true,
            format: true,
            status: true,
            createdAt: true,
            creator: { select: { displayName: true } },
          },
        }),
    // Community/Game Release: real, admin-authored CalendarEvent rows
    // (Admin > Calendar) — the `game` filter doesn't apply to either,
    // neither has a `game` field.
    prisma.calendarEvent.findMany({
          where: { category: "COMMUNITY", cancelled: false, date: { gte: rangeStart, lte: rangeEnd } },
          orderBy: { date: "asc" },
          take: 200,
        }),
    prisma.calendarEvent.findMany({
          where: { category: "GAME_RELEASE", cancelled: false, date: { gte: rangeStart, lte: rangeEnd } },
          orderBy: { date: "asc" },
          take: 200,
        }),
  ]);

  const allEvents: CalendarEvent[] = [
    ...tournaments.map(
      (t): CalendarEvent => ({
        kind: "tournament",
        id: t.id,
        date: t.startAt,
        name: t.name,
        game: t.game,
        status: t.status,
        format: t.format,
        teamSize: t.teamSize,
        entryFee: t.entryFee,
        prizeAmount: t.prizeAmount,
        prizeText: t.prizeText,
        participantCap: t.participantCap,
        registered: t._count.registrations,
      })
    ),
    ...battles.map(
      (b): CalendarEvent => ({
        kind: "challenge",
        id: b.id,
        date: b.createdAt,
        game: b.game,
        format: b.format,
        status: b.status,
        hostName: b.creator.displayName,
      })
    ),
    ...communityEvents.map((e): CalendarEvent => ({ kind: "community", id: e.id, date: e.date, title: e.title })),
    ...gameReleaseEvents.map((e): CalendarEvent => ({ kind: "game_release", id: e.id, date: e.date, title: e.title })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const kindForType = type === "all" ? null : TYPE_TABS.find((t) => t.value === type)!.kind;
  const events = kindForType ? allEvents.filter((e) => e.kind === kindForType) : allEvents;

  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = dateKey(event.date);
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key)!.push(event);
  }

  const monthStart = startOfDay(new Date(year, month - 1, 1));
  const monthEnd = endOfDay(new Date(year, month, 0));

  // Featured this month: real prize-backed tournaments starting within the
  // strict calendar month, topped up with soonest-starting real ones —
  // same "prized first, soonest-start filler" logic as the homepage's
  // FeaturedCompetitions query, just scoped to this visible month.
  const inMonth = (e: CalendarEvent) => e.date >= monthStart && e.date <= monthEnd;
  const kindCounts = new Map<EventKind, number>();
  for (const e of allEvents) if (inMonth(e)) kindCounts.set(e.kind, (kindCounts.get(e.kind) ?? 0) + 1);
  const monthPrizePool = tournaments
    .filter((t) => t.startAt >= monthStart && t.startAt <= monthEnd && t.status !== "CANCELLED")
    .reduce((sum, t) => sum + (t.prizeAmount ?? 0), 0);

  // First event after the selected day — the empty-day panel's "next up".
  const selectedEnd = endOfDay(selectedDate);
  const nextEvent = events.find((e) => e.date > selectedEnd) ?? null;

  const inMonthTournaments = tournaments.filter(
    (t) => t.startAt >= monthStart && t.startAt <= monthEnd && (t.status === "OPEN" || t.status === "LIVE")
  );
  const prized = [...inMonthTournaments]
    .filter((t) => t.prizeAmount !== null)
    .sort((a, b) => (b.prizeAmount ?? 0) - (a.prizeAmount ?? 0))
    .slice(0, 3);
  const filler = inMonthTournaments.filter((t) => !prized.some((p) => p.id === t.id)).slice(0, 3 - prized.length);
  const featured = [...prized, ...filler];

  const listGroups = (() => {
    const inMonthEvents = events.filter(inMonth);
    const map = new Map<string, CalendarEvent[]>();
    for (const e of inMonthEvents) {
      const key = dateKey(e.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).map(([key, evs]) => ({ key, date: parseDateKey(key), events: evs }));
  })();

  const baseParams: Record<string, string> = { y: String(year), m: String(month), view, type, game, day: selectedKey };

  function href(overrides: Partial<Record<keyof typeof baseParams, string>>): string {
    const merged = { ...baseParams, ...overrides };
    const params = new URLSearchParams();
    if (merged.y) params.set("y", merged.y);
    if (merged.m) params.set("m", merged.m);
    if (merged.view && merged.view !== "month") params.set("view", merged.view);
    if (merged.type && merged.type !== "all") params.set("type", merged.type);
    if (merged.game) params.set("game", merged.game);
    if (merged.day) params.set("day", merged.day);
    const qs = params.toString();
    return qs ? `/calendar?${qs}` : "/calendar";
  }

  const prevMonth = addMonths(year, month, -1);
  const nextMonth = addMonths(year, month, 1);

  const tournamentCount = kindCounts.get("tournament") ?? 0;
  const challengeCount = kindCounts.get("challenge") ?? 0;
  const summary: [string, string][] = [
    [String(tournamentCount), tournamentCount === 1 ? "tournament" : "tournaments"],
    [String(challengeCount), challengeCount === 1 ? "open challenge" : "open challenges"],
    ...(monthPrizePool > 0 ? [[formatCompactNaira(monthPrizePool), "in prizes"] as [string, string]] : []),
  ];
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const chipBase =
    "flex shrink-0 items-center gap-2 rounded-[9px] border px-3 py-[7px] text-[13px] font-medium transition-colors duration-[var(--duration-fast)]";
  const chipIdle = "border-border bg-surface text-muted hover:border-border-hover hover:text-foreground";
  const chipActive = "border-foreground bg-foreground text-background";

  return (
    <div className="flex w-full flex-1 flex-col gap-5 px-4 py-5 sm:gap-6 sm:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">Calendar</span>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[32px] leading-none font-bold tracking-tight sm:text-[44px]">
              {MONTH_LABELS[month - 1]}
              <span className="ml-2 text-muted-strong">{year}</span>
            </h1>
            <div className="ml-auto flex items-center gap-1 lg:ml-2">
              <Link
                href={href({ y: String(prevMonth.year), m: String(prevMonth.month) })}
                scroll={false}
                aria-label="Previous month"
                className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-border bg-surface text-muted transition hover:border-border-hover hover:text-foreground"
              >
                <ChevronLeft size={16} />
              </Link>
              <Link
                href={href({ y: String(nextMonth.year), m: String(nextMonth.month) })}
                scroll={false}
                aria-label="Next month"
                className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-border bg-surface text-muted transition hover:border-border-hover hover:text-foreground"
              >
                <ChevronRight size={16} />
              </Link>
              {!isCurrentMonth || selectedKey !== todayKey ? (
                <Link
                  href={href({ y: String(now.getFullYear()), m: String(now.getMonth() + 1), day: todayKey })}
                  scroll={false}
                  className="ml-1 flex h-9 items-center rounded-[9px] border border-border bg-surface px-3 text-[13px] font-semibold transition hover:border-border-hover"
                >
                  Today
                </Link>
              ) : null}
            </div>
          </div>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-muted">
            {summary.map(([value, label]) => (
              <span key={label}>
                <span className="font-semibold text-foreground tabular-nums">{value}</span> {label}
              </span>
            ))}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-[10px] border border-border bg-surface p-[3px] lg:flex-none" role="tablist" aria-label="View">
            {(["month", "week", "list"] as const).map((v) => (
              <Link
                key={v}
                href={href({ view: v })}
                scroll={false}
                role="tab"
                aria-selected={view === v}
                className={`flex-1 rounded-[7px] px-3.5 py-1.5 text-center text-[13px] font-semibold capitalize transition lg:flex-none ${
                  view === v ? "bg-foreground text-background" : "text-muted hover:text-foreground"
                }`}
              >
                {v}
              </Link>
            ))}
          </div>
          <GameFilterSelect game={game} options={GAME_ACTIVITY.map((g) => g.name)} baseQuery={baseParams} />
        </div>
      </header>

      <nav aria-label="Event types" className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link href={href({ type: "all" })} scroll={false} className={`${chipBase} ${type === "all" ? chipActive : chipIdle}`}>
          All
          <span className="font-mono text-[11px] opacity-60 tabular-nums">{Array.from(kindCounts.values()).reduce((a, b) => a + b, 0)}</span>
        </Link>
        {TYPE_TABS.map((tab) => {
          const meta = EVENT_KIND_META[tab.kind];
          const active = type === tab.value;
          return (
            <Link
              key={tab.value}
              href={href({ type: active ? "all" : tab.value })}
              scroll={false}
              aria-pressed={active}
              className={`${chipBase} ${active ? chipActive : chipIdle}`}
            >
              <span
                aria-hidden
                className="cal-dot h-2 w-2 rounded-[3px] ring-1 ring-black/5"
                style={{ "--ev": meta.color } as React.CSSProperties}
              />
              {meta.plural}
              <span className="font-mono text-[11px] opacity-60 tabular-nums">{kindCounts.get(tab.kind) ?? 0}</span>
            </Link>
          );
        })}
      </nav>

      {/* One grid, three children in reading order (calendar, day agenda,
          featured) — so on phones the agenda lands right under the grid
          it belongs to; from xl it moves into a sticky right rail
          spanning both rows. */}
      <div className={`grid grid-cols-1 gap-5 xl:gap-x-6 xl:gap-y-8 ${view === "list" ? "" : "xl:grid-cols-[minmax(0,1fr)_360px]"}`}>
        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
          {/* Month/view/filter changes crossfade the grid; picking a day
              doesn't (only the agenda swaps). */}
          <ViewTransition key={`${year}-${month}-${view}-${type}-${game}`} name="calendar-grid" share="content-swap" enter="content-swap" default="none">
            <div>
              {view === "list" && <CalendarListView groups={listGroups} todayKey={todayKey} />}
              {view === "month" && (
                <CalendarGrid days={gridDays} eventsByDay={eventsByDay} currentMonth={month} selectedKey={selectedKey} todayKey={todayKey} dayHref={(key) => href({ day: key })} />
              )}
              {view === "week" && (
                <CalendarGrid days={weekDays} eventsByDay={eventsByDay} currentMonth={null} selectedKey={selectedKey} todayKey={todayKey} dayHref={(key) => href({ day: key })} dense />
              )}
            </div>
          </ViewTransition>
        </div>

        {view !== "list" && (
          <div className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:self-start xl:sticky xl:top-[76px]">
            <ViewTransition key={selectedKey} name="calendar-day" share="content-swap" enter="content-swap" default="none">
              <CalendarDayPanel
                date={selectedDate}
                events={eventsByDay.get(selectedKey) ?? []}
                isToday={selectedKey === todayKey}
                nextUp={nextEvent ? { event: nextEvent, href: nextDayHref(nextEvent) } : null}
              />
            </ViewTransition>
          </div>
        )}

        <div className="mt-3 min-w-0 xl:col-start-1 xl:row-start-2 xl:mt-0">
          <FeaturedCompetitions
            tournaments={featured}
            title="Featured This Month"
            viewAllHref="/compete"
            anchorId="calendar-featured"
            showFeaturedBadge
          />
        </div>
      </div>
    </div>
  );

  function nextDayHref(event: CalendarEvent): string {
    const d = event.date;
    return href({ y: String(d.getFullYear()), m: String(d.getMonth() + 1), day: dateKey(d) });
  }
}
