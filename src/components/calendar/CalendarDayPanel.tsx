import Link from "next/link";
import { ArrowRight, Gamepad2, Megaphone, Trophy, Users } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { StatusPill, tournamentStatusInfo, battleStatusInfo } from "@/components/StatusPill";
import { EVENT_KIND_META, eventColor, eventHref, eventTitle, eventTimeLabel, type CalendarEvent } from "./types";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replace(/_/g, " ");
}

function formatBattleFormat(format: string): string {
  return format === "BEST_OF_3" ? "Best of 3" : "Single match";
}

/** One event's body — the card half of an agenda row. Shared with the
 *  list view so the two never describe the same event differently. */
export function AgendaEventBody({ event }: { event: CalendarEvent }) {
  if (event.kind === "tournament" || event.kind === "challenge") {
    const status = event.kind === "tournament" ? tournamentStatusInfo(event.status) : battleStatusInfo(event.status);
    const prize =
      event.kind === "tournament"
        ? event.prizeAmount
          ? formatNaira(event.prizeAmount)
          : event.entryFee === 0
            ? "Free entry"
            : `${formatNaira(event.entryFee)} entry`
        : "Free entry";

    return (
      <Link
        href={eventHref(event)!}
        className="group flex min-w-0 flex-1 items-start gap-3 rounded-[12px] border border-border bg-surface p-3 transition duration-[var(--duration-base)] hover:border-border-hover hover:bg-surface-elevated/50"
      >
        <GameArtTile game={event.game} className="h-10 w-10 shrink-0 rounded-[9px]" hideLabel imgWidth={100} />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 flex-col">
              <span className="line-clamp-2 text-sm leading-snug font-semibold text-foreground">
                {eventTitle(event)}
              </span>
              <span className="truncate text-xs text-muted">
                {event.kind === "tournament"
                  ? `${event.game} · ${event.teamSize} · ${capitalize(event.format)}`
                  : `${formatBattleFormat(event.format)} · by ${event.hostName}`}
              </span>
            </span>
            <ArrowRight size={14} className="mt-0.5 shrink-0 text-muted-strong transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusPill tone={status.tone} pulse={status.pulse}>
              {status.label}
            </StatusPill>
            <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
              <Trophy size={12} className="text-gold" />
              {prize}
            </span>
            {event.kind === "tournament" && (
              <span className="flex items-center gap-1 font-mono text-[11px] text-muted tabular-nums">
                <Users size={12} />
                {event.registered}/{event.participantCap}
              </span>
            )}
          </span>
        </span>
      </Link>
    );
  }

  // Community/Game Release: admin-authored rows with no detail page of
  // their own — the calendar is their whole surface, so not a link.
  const Icon = event.kind === "community" ? Megaphone : Gamepad2;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[12px] border border-dashed border-border-strong p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] bg-surface-elevated text-foreground">
        <Icon size={17} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-foreground">{event.title}</span>
        <span className="text-xs text-muted">{EVENT_KIND_META[event.kind].label}</span>
      </span>
    </div>
  );
}

/** Time column + coloured node on a vertical rail + the event body. */
export function AgendaRow({ event, last }: { event: CalendarEvent; last: boolean }) {
  return (
    <li className="relative flex gap-3">
      <span className="w-11 shrink-0 pt-3 text-right font-mono text-[11px] font-semibold text-foreground tabular-nums">
        {eventTimeLabel(event)}
      </span>
      <span aria-hidden className="relative flex w-3 shrink-0 justify-center">
        <span className={`absolute top-0 w-px bg-border ${last ? "h-4" : "bottom-[-12px]"}`} />
        <span
          className="cal-dot relative mt-[15px] h-2.5 w-2.5 rounded-full ring-4 ring-surface"
          style={{ "--ev": eventColor(event) } as React.CSSProperties}
        />
      </span>
      <AgendaEventBody event={event} />
    </li>
  );
}

export function CalendarDayPanel({
  date,
  events,
  isToday,
  nextUp,
}: {
  date: Date;
  events: CalendarEvent[];
  isToday: boolean;
  /** The first event after this day, within the fetched range — gives an
   *  empty day somewhere to send you instead of a dead end. */
  nextUp: { event: CalendarEvent; href: string } | null;
}) {
  return (
    <aside className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-4 sm:p-5 xl:max-h-[calc(100vh-92px)]">
      <header className="flex shrink-0 items-center gap-3.5">
        <span className="font-display text-[40px] leading-none font-bold tracking-tight tabular-nums">{date.getDate()}</span>
        <span className="flex flex-col">
          <span className="text-sm font-semibold">
            {date.toLocaleDateString("en-NG", { weekday: "long" })}
            {isToday && <span className="ml-2 rounded-[4px] bg-accent-volt px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] text-accent-volt-foreground uppercase align-middle">Today</span>}
          </span>
          <span className="text-xs text-muted">{date.toLocaleDateString("en-NG", { month: "long", year: "numeric" })}</span>
        </span>
        <span className="ml-auto font-mono text-[11px] text-muted tabular-nums">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </header>

      {events.length === 0 ? (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-sm text-muted">Nothing on the schedule {isToday ? "today" : "this day"}.</p>
          {nextUp && (
            <Link
              href={nextUp.href}
              scroll={false}
              className="group flex items-center gap-3 rounded-[12px] bg-surface-elevated/70 p-3 transition hover:bg-surface-elevated"
            >
              <span
                className="cal-dot h-2 w-2 shrink-0 rounded-full"
                style={{ "--ev": eventColor(nextUp.event) } as React.CSSProperties}
                aria-hidden
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">
                  Next up · {nextUp.event.date.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <span className="truncate text-sm font-semibold">{eventTitle(nextUp.event)}</span>
              </span>
              <ArrowRight size={14} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      ) : (
        /* Only the list scrolls on desktop — a busy day can't stretch the page. */
        <ol className="scrollbar-hide -mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-1">
          {events.map((event, i) => (
            <AgendaRow key={`${event.kind}-${event.id}`} event={event} last={i === events.length - 1} />
          ))}
        </ol>
      )}
    </aside>
  );
}
