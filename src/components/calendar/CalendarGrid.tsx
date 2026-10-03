import Link from "next/link";
import { WEEKDAY_LABELS, dateKey } from "@/lib/calendar";
import { eventColor, eventTitle, eventTimeLabel, type CalendarEvent } from "./types";

const MONTH_CAP = 3;
const WEEK_CAP = 7;
const MAX_DOTS = 3;

/**
 * Circuit — month/week grid for `/calendar`. Pure presentational server
 * component: every cell is a `Link` to `?day=<key>` (built by the caller
 * via `dayHref`, which preserves the other filters/view already in the
 * URL) so selecting a day is a normal navigation, not client state.
 *
 * Two densities from one grid: from `sm` up each cell lists its events
 * as time + title rows with a kind-coloured edge; on phones there's no
 * room for text in a seventh of the width, so a cell is just the date
 * and up to three coloured dots — the day agenda under the grid carries
 * the detail, same as a phone's own calendar app.
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
  /** 1-indexed month being displayed — cells outside it render hatched.
   *  Pass `null` for week view, where every cell is "in range". */
  currentMonth: number | null;
  selectedKey: string;
  todayKey: string;
  dayHref: (key: string) => string;
  /** Week view: taller cells, higher event cap. */
  dense?: boolean;
}) {
  const cap = dense ? WEEK_CAP : MONTH_CAP;

  return (
    <div className="overflow-hidden cut-sm [--cut-line:var(--border)] border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={`py-2.5 text-center font-mono text-[11px] font-semibold tracking-[0.14em] uppercase sm:px-3 sm:text-left ${
              i === 0 || i === 6 ? "text-muted-strong" : "text-muted"
            }`}
          >
            <span className="sm:hidden">{label.slice(0, 1)}</span>
            <span className="hidden sm:inline">{label}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, index) => {
          const key = dateKey(day);
          const events = eventsByDay.get(key) ?? [];
          const inMonth = currentMonth === null || day.getMonth() + 1 === currentMonth;
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          const visible = events.slice(0, cap);
          const overflow = events.length - visible.length;
          const lastCol = index % 7 === 6;
          const lastRow = index >= days.length - 7;

          return (
            <Link
              key={key}
              href={dayHref(key)}
              scroll={false}
              aria-label={`${day.toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" })}, ${events.length} event${events.length === 1 ? "" : "s"}`}
              aria-current={isSelected ? "date" : undefined}
              className={`group relative flex flex-col items-center gap-1.5 px-1 pt-2 pb-2.5 transition-colors duration-[var(--duration-fast)] sm:items-stretch sm:gap-1 sm:px-1.5 sm:pt-1.5 ${
                dense ? "min-h-[64px] sm:min-h-[260px]" : "min-h-[56px] sm:min-h-[118px]"
              } ${lastCol ? "" : "border-r border-border"} ${lastRow ? "" : "border-b border-border"} ${
                inMonth ? "hover:bg-surface-elevated/60" : "cal-outside"
              } ${isSelected ? "bg-surface-elevated/80" : ""}`}
            >
              {isSelected && (
                <span aria-hidden className="pointer-events-none absolute inset-0 hidden ring-2 ring-foreground ring-inset sm:block" />
              )}

              <span className="flex items-center justify-between sm:px-1">
                <span
                  className={`flex h-7 w-7 items-center justify-center cut-xs font-mono text-[13px] font-semibold tabular-nums sm:h-6 sm:w-auto sm:min-w-6 sm:rounded-none sm:px-1.5 sm:text-xs ${
                    isToday
                      ? "bg-accent-volt text-accent-volt-foreground"
                      : isSelected
                        ? "bg-foreground text-background sm:bg-transparent sm:text-foreground"
                        : inMonth
                          ? "text-foreground"
                          : "text-muted-strong"
                  }`}
                >
                  {day.getDate()}
                </span>
                {isToday && (
                  <span className="hidden font-mono text-[10px] font-bold tracking-[0.14em] text-muted uppercase lg:inline">Today</span>
                )}
              </span>

              {/* Phones: dots only. */}
              {events.length > 0 && (
                <span className="flex items-center gap-[3px] sm:hidden" aria-hidden>
                  {events.slice(0, MAX_DOTS).map((event) => (
                    <span
                      key={`${event.kind}-${event.id}`}
                      className="cal-dot h-[5px] w-[5px] rounded-full"
                      style={{ "--ev": eventColor(event) } as React.CSSProperties}
                    />
                  ))}
                </span>
              )}

              {/* sm+: time + title rows. */}
              <span className="hidden flex-col gap-[3px] sm:flex">
                {visible.map((event) => (
                  <span
                    key={`${event.kind}-${event.id}`}
                    className="cal-event flex min-w-0 items-baseline gap-1.5 rounded-none py-[3px] pr-1.5 pl-2 text-[11px] leading-tight"
                    style={{ "--ev": eventColor(event) } as React.CSSProperties}
                  >
                    <span className="hidden shrink-0 font-mono text-[11px] text-muted tabular-nums 2xl:inline">{eventTimeLabel(event)}</span>
                    <span className="truncate font-medium text-foreground">{eventTitle(event)}</span>
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="px-1.5 pt-0.5 font-mono text-[11px] font-semibold text-muted group-hover:text-foreground">
                    +{overflow} more
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
