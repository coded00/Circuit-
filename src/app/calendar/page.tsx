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
 */

import Link from "next/link";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { CINEMATIC_GAMING_IMAGE, unsplashUrl } from "@/lib/gameImagery";
import { GAME_ACTIVITY } from "@/lib/circuitActivity";
import {
  addMonths,
  dateKey,
  endOfDay,
  getMonthGridDays,
  getWeekDays,
  monthLabel,
  parseDateKey,
  startOfDay,
} from "@/lib/calendar";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { CalendarDayPanel } from "@/components/calendar/CalendarDayPanel";
import { CalendarListView } from "@/components/calendar/CalendarListView";
import { GameFilterSelect } from "@/components/calendar/GameFilterSelect";
import { FeaturedCompetitions } from "@/components/FeaturedCompetitions";
import type { CalendarEvent } from "@/components/calendar/types";

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

const TYPE_TABS: { value: EventType; label: string }[] = [
  { value: "all", label: "All Events" },
  { value: "tournaments", label: "Tournaments" },
  { value: "challenges", label: "Challenges" },
  { value: "community", label: "Community" },
  { value: "game_releases", label: "Game Releases" },
];

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

  const gridDays = getMonthGridDays(year, month);
  const weekDays = getWeekDays(selectedDate);
  const rangeStart = startOfDay(gridDays[0]);
  const rangeEnd = endOfDay(gridDays[gridDays.length - 1]);

  const showTournaments = type === "all" || type === "tournaments";
  const showChallenges = type === "all" || type === "challenges";
  const showCommunity = type === "all" || type === "community";
  const showGameReleases = type === "all" || type === "game_releases";

  const [tournaments, battles, communityEvents, gameReleaseEvents] = await Promise.all([
    !showTournaments
      ? Promise.resolve([])
      : prisma.tournament.findMany({
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
    !showChallenges
      ? Promise.resolve([])
      : prisma.battle.findMany({
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
    !showCommunity
      ? Promise.resolve([])
      : prisma.calendarEvent.findMany({
          where: { category: "COMMUNITY", cancelled: false, date: { gte: rangeStart, lte: rangeEnd } },
          orderBy: { date: "asc" },
          take: 200,
        }),
    !showGameReleases
      ? Promise.resolve([])
      : prisma.calendarEvent.findMany({
          where: { category: "GAME_RELEASE", cancelled: false, date: { gte: rangeStart, lte: rangeEnd } },
          orderBy: { date: "asc" },
          take: 200,
        }),
  ]);

  const events: CalendarEvent[] = [
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
    const inMonthEvents = events.filter((e) => e.date >= monthStart && e.date <= monthEnd);
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

  return (
    <div className="flex w-full flex-1 flex-col gap-6 p-6 sm:p-8">
      <div
        data-surface="dark"
        className="relative flex h-[190px] w-full flex-col justify-center overflow-hidden rounded-[16px] border border-border px-6 sm:h-[220px] sm:px-8"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- external CDN hero photo, same asset CircuitHero uses */}
        <img src={unsplashUrl(CINEMATIC_GAMING_IMAGE, 1400)} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(100deg, var(--background) 15%, color-mix(in srgb, var(--background) 70%, transparent) 55%, color-mix(in srgb, var(--background) 30%, transparent) 100%)",
          }}
        />
        {/* Decorative accent only, reusing the same real, established
            tagline the homepage hero already uses ("More Games. Bigger
            Moments.") — not new marketing copy, just given the same
            visual weight the reference layout gave its own headline. */}
        <div aria-hidden className="absolute top-1/2 right-6 z-10 hidden -translate-y-1/2 -rotate-3 text-right sm:block lg:right-10">
          <span className="font-display text-3xl leading-[0.95] font-bold tracking-tight text-accent-volt italic lg:text-4xl">
            More Games.
            <br />
            Bigger Moments.
          </span>
        </div>
        <div className="relative z-10 flex flex-col gap-1.5">
          <h1 className="font-display flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <CalendarIcon size={22} className="text-accent-volt" />
            Calendar
          </h1>
          <p className="max-w-md text-sm text-muted">All tournaments and challenges on Circuit, in one place.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {TYPE_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={href({ type: tab.value })}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                type === tab.value ? "bg-foreground text-background" : "text-muted hover:bg-surface-elevated hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href={href({ y: String(now.getFullYear()), m: String(now.getMonth() + 1), day: todayKey })} className="btn-secondary px-3 py-1.5 text-xs">
              Today
            </Link>
            <Link href={href({ y: String(prevMonth.year), m: String(prevMonth.month) })} aria-label="Previous month" className="btn-icon">
              <ChevronLeft size={16} />
            </Link>
            <Link href={href({ y: String(nextMonth.year), m: String(nextMonth.month) })} aria-label="Next month" className="btn-icon">
              <ChevronRight size={16} />
            </Link>
            <h2 className="font-display text-lg font-bold tracking-tight">{monthLabel(year, month)}</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-[10px] border border-border bg-surface p-1">
              {(["month", "week", "list"] as const).map((v) => (
                <Link
                  key={v}
                  href={href({ view: v })}
                  className={`rounded-[7px] px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    view === v ? "bg-foreground text-background" : "text-muted hover:text-foreground"
                  }`}
                >
                  {v}
                </Link>
              ))}
            </div>
            <GameFilterSelect game={game} options={GAME_ACTIVITY.map((g) => g.name)} baseQuery={baseParams} />
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${view === "list" ? "" : "xl:grid-cols-[1fr_340px]"}`}>
        <div className="flex min-w-0 flex-col gap-4">
          {view === "list" && <CalendarListView groups={listGroups} />}
          {view === "month" && (
            <CalendarGrid days={gridDays} eventsByDay={eventsByDay} currentMonth={month} selectedKey={selectedKey} todayKey={todayKey} dayHref={(key) => href({ day: key })} />
          )}
          {view === "week" && (
            <CalendarGrid days={weekDays} eventsByDay={eventsByDay} currentMonth={null} selectedKey={selectedKey} todayKey={todayKey} dayHref={(key) => href({ day: key })} dense />
          )}

          {view !== "list" && (
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-accent-blue" aria-hidden />
                Tournament
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-accent-orange" aria-hidden />
                Challenge
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-purple-500" aria-hidden />
                Community
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden />
                Game Release
              </span>
            </div>
          )}

          {/* Directly under the grid/list, in the same column — not a
              full-width block below the day panel too, which (with a
              busy day panel) could end up far from the calendar it's
              actually placed under. */}
          <FeaturedCompetitions
            tournaments={featured}
            title="Featured This Month"
            viewAllHref="/compete"
            anchorId="calendar-featured"
            showFeaturedBadge
          />
        </div>

        {view !== "list" && <CalendarDayPanel date={selectedDate} events={eventsByDay.get(selectedKey) ?? []} />}
      </div>
    </div>
  );
}
