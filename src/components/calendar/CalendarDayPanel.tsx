import Link from "next/link";
import { Calendar, Users, Trophy, Swords, ArrowRight, Megaphone, Gamepad2 } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { StatusPill, tournamentStatusInfo, battleStatusInfo } from "@/components/StatusPill";
import { eventHref, eventDotClass, type CalendarEvent } from "./types";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
}

function formatBattleFormat(format: string): string {
  return format === "BEST_OF_3" ? "Best of 3" : "Single match";
}

function TournamentOrChallengeCard({ event }: { event: Extract<CalendarEvent, { kind: "tournament" | "challenge" }> }) {
  const status = event.kind === "tournament" ? tournamentStatusInfo(event.status) : battleStatusInfo(event.status);

  return (
    <Link href={eventHref(event)!} className="card card-hover flex flex-col gap-3 p-3.5">
      <div className="flex items-start gap-3">
        <GameArtTile game={event.game} className="h-11 w-11 shrink-0 rounded-[9px]" hideLabel imgWidth={120} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-semibold text-muted uppercase">{event.game}</span>
            <StatusPill tone={status.tone} pulse={status.pulse}>
              {status.label}
            </StatusPill>
          </div>
          <span className="truncate font-display text-sm font-bold text-foreground">
            {event.kind === "tournament" ? event.name : `${event.game} Challenge`}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <Calendar size={11} />
          {event.date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
          {formatTime(event.date)}
        </span>
        {event.kind === "tournament" ? (
          <span className="flex items-center gap-1">
            <Users size={11} />
            {event.registered} / {event.participantCap} Players
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <Users size={11} />
            Hosted by {event.hostName}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {event.kind === "tournament" ? (
          <>
            <span className="badge badge-neutral">{event.teamSize}</span>
            <span className="badge badge-neutral capitalize">{event.format.toLowerCase()}</span>
          </>
        ) : (
          <span className="badge badge-neutral">{formatBattleFormat(event.format)}</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gold">
          <Trophy size={13} />
          {event.kind === "tournament"
            ? event.prizeAmount
              ? formatNaira(event.prizeAmount)
              : event.entryFee === 0
                ? "Free entry"
                : formatNaira(event.entryFee)
            : "Free entry"}
        </span>
        <span className="btn-primary px-3 py-1.5 text-xs">
          View Details
          <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  );
}

/** Community/Game Release rows: real admin-authored `CalendarEvent` rows
 *  (Admin > Calendar), but with no detail page of their own — the
 *  calendar day panel is the entire surface for these two, so this is a
 *  plain card, not a link. */
function CommunityOrReleaseCard({ event }: { event: Extract<CalendarEvent, { kind: "community" | "game_release" }> }) {
  const Icon = event.kind === "community" ? Megaphone : Gamepad2;
  const label = event.kind === "community" ? "Community" : "Game Release";

  return (
    <div className="card flex items-center gap-3 p-3.5">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[9px] text-white ${eventDotClass(event)}`}>
        <Icon size={18} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-semibold text-muted uppercase">{label}</span>
        <span className="truncate font-display text-sm font-bold text-foreground">{event.title}</span>
        <span className="text-[11px] text-muted">{formatTime(event.date)}</span>
      </div>
    </div>
  );
}

function EventCard({ event }: { event: CalendarEvent }) {
  if (event.kind === "tournament" || event.kind === "challenge") {
    return <TournamentOrChallengeCard event={event} />;
  }
  return <CommunityOrReleaseCard event={event} />;
}

export function CalendarDayPanel({
  date,
  events,
}: {
  date: Date;
  events: CalendarEvent[];
}) {
  return (
    <div className="card flex max-h-[calc(100vh-92px)] flex-col gap-4 lg:sticky lg:top-[76px]">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-card-title">
          {date.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        </h2>
        <span className="text-xs font-medium text-muted">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Swords size={22} className="text-muted-strong" />
          <p className="text-sm text-muted">Nothing scheduled this day.</p>
        </div>
      ) : (
        /* The card's own header stays put; only this list scrolls — so
           a busy day (11+ events) can't stretch the whole page instead. */
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {events.map((event) => (
            <EventCard key={`${event.kind}-${event.id}`} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
