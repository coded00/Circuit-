import Link from "next/link";
import { WEEKDAY_LABELS, dateKey } from "@/lib/calendar";
import { eventPillClass, eventTitle, type CalendarEvent } from "./types";

const MAX_VISIBLE_PILLS = 2;

/**
 * Circuit — month/week grid for `/calendar`. Pure presentational server
 * component: every cell is a `Link` to `?day=<key>` (built by the caller
 * via `dayHref`, which preserves the other filters/view already in the
 * URL) so selecting a day is a normal navigation, not client state — the
 * right-hand day panel is just whatever the server rendered for that
 * `day`, same pattern `/compete`'s filter form already uses.
 */
export function CalendarGrid({
  days,
  eventsByDay,
  currentMonth,
  selectedKey,
  todayKey,
  dayHref,
  dense = false,
}: {
  days: Date[];
  eventsByDay: Map<string, CalendarEvent[]>;
  /** 1-indexed month being displayed — cells outside it render dimmed.
   *  Pass `null` for week view, where every cell is "in range". */
  currentMonth: number | null;
  selectedKey: string;
  todayKey: string;
  dayHref: (key: string) => string;
  /** Week view: taller cells, higher pill cap, no month dimming. */
  dense?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-3 text-center text-xs font-semibold text-muted">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = dateKey(day);
          const events = eventsByDay.get(key) ?? [];
          const inMonth = currentMonth === null || day.getMonth() + 1 === currentMonth;
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          const cap = dense ? 5 : MAX_VISIBLE_PILLS;
          const visible = events.slice(0, cap);
          const overflow = events.length - visible.length;
          // Same cap-2 data both sizes — below `sm` the 2nd pill is just
          // visually hidden (7 columns leaves very little width per cell
          // on a phone) and folded into the "+N more" count instead.
          const mobileOverflow = events.length - Math.min(events.length, dense ? 5 : 1);

          return (
            <Link
              key={key}
              href={dayHref(key)}
              className={`flex min-h-[90px] flex-col gap-1.5 border-r border-b border-border p-1.5 text-left transition last:border-r-0 hover:bg-surface-elevated sm:min-h-[120px] sm:gap-2 sm:p-2.5 ${
                dense ? "min-h-[180px] sm:min-h-[240px]" : ""
              } ${isSelected ? "bg-accent-volt/10 ring-2 ring-inset ring-accent-volt" : ""} ${
                inMonth ? "bg-surface" : "bg-surface/40"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold sm:h-6 sm:w-6 sm:text-xs ${
                  isToday
                    ? "bg-foreground text-background"
                    : inMonth
                      ? "text-foreground"
                      : "text-muted-strong"
                }`}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-1">
                {visible.map((event, i) => (
                  <span
                    key={`${event.kind}-${event.id}`}
                    className={`truncate rounded-full px-2.5 py-1 text-[10px] font-semibold ${eventPillClass(event)} ${
                      i >= 1 && !dense ? "hidden sm:block" : ""
                    }`}
                  >
                    {eventTitle(event)}
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="hidden px-1 text-[10px] font-medium text-muted sm:block">+{overflow} more</span>
                )}
                {mobileOverflow > 0 && !dense && (
                  <span className="px-1 text-[10px] font-medium text-muted sm:hidden">+{mobileOverflow} more</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
