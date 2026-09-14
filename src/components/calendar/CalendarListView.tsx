import Link from "next/link";
import { Calendar as CalendarIcon, ArrowRight, Megaphone, Gamepad2 } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { StatusPill, tournamentStatusInfo, battleStatusInfo } from "@/components/StatusPill";
import { eventHref, eventTitle, eventDotClass, type CalendarEvent } from "./types";

/**
 * Circuit — `/calendar` agenda view: every real event in the visible
 * month, chronological, grouped by day. Four real event kinds — see
 * `./types.ts` for what each is grounded in.
 */
function EventRow({ event }: { event: CalendarEvent }) {
  if (event.kind === "tournament" || event.kind === "challenge") {
    const status = event.kind === "tournament" ? tournamentStatusInfo(event.status) : battleStatusInfo(event.status);
    return (
      <Link href={eventHref(event)!} className="card-row flex items-center gap-3 p-3">
        <GameArtTile game={event.game} className="h-10 w-10 shrink-0 rounded-[8px]" hideLabel imgWidth={100} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">{eventTitle(event)}</span>
          <span className="truncate text-xs text-muted">
            {event.game} · {event.date.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}
          </span>
        </div>
        <StatusPill tone={status.tone} pulse={status.pulse}>
          {status.label}
        </StatusPill>
        <ArrowRight size={14} className="hidden shrink-0 text-muted sm:block" />
      </Link>
    );
  }

  const Icon = event.kind === "community" ? Megaphone : Gamepad2;
  const label = event.kind === "community" ? "Community" : "Game Release";
  return (
    <div className="card-row flex items-center gap-3 p-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] text-white ${eventDotClass(event)}`}>
        <Icon size={16} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-foreground">{event.title}</span>
        <span className="truncate text-xs text-muted">
          {label} · {event.date.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

export function CalendarListView({ groups }: { groups: { key: string; date: Date; events: CalendarEvent[] }[] }) {
  if (groups.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-16 text-center">
        <CalendarIcon size={22} className="text-muted-strong" />
        <p className="text-sm text-muted">Nothing on the calendar this month.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-2">
          <h3 className="text-eyebrow">
            {group.date.toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" })}
          </h3>
          <div className="flex flex-col gap-2">
            {group.events.map((event) => (
              <EventRow key={`${event.kind}-${event.id}`} event={event} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
