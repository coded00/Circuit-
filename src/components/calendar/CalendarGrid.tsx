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

          return (
            <Link
              key={key}
              href={dayHref(key)}
              className={`flex min-h-[120px] flex-col gap-2 border-r border-b border-border p-2.5 text-left transition last:border-r-0 hover:bg-surface-elevated ${
                dense ? "min-h-[240px]" : ""
              } ${isSelected ? "bg-accent-volt/10 ring-2 ring-inset ring-accent-volt" : ""} ${
                inMonth ? "bg-surface" : "bg-surface/40"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
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
                {visible.map((event) => (
                  <span
                    key={`${event.kind}-${event.id}`}
                    className={`truncate rounded-full px-2.5 py-1 text-[10px] font-semibold ${eventPillClass(event)}`}
                  >
                    {eventTitle(event)}
                  </span>
                ))}
                {overflow > 0 && <span className="px-1 text-[10px] font-medium text-muted">+{overflow} more</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
