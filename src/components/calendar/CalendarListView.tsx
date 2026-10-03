import { AgendaRow } from "./CalendarDayPanel";
import type { CalendarEvent } from "./types";

/**
 * Circuit — `/calendar` agenda view: every real event in the visible
 * month, chronological, grouped by day. From `sm` up the date sits in its
 * own sticky column beside that day's events (a fixtures list, not a
 * stack of cards); on phones it collapses to a header above them. Rows
 * are the same AgendaRow the day panel uses.
 */
export function CalendarListView({
  groups,
  todayKey,
}: {
  groups: { key: string; date: Date; events: CalendarEvent[] }[];
  todayKey: string;
}) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 cut-sm [--cut-line:var(--border)] border border-dashed border-border-strong px-6 py-16 text-center">
        <p className="text-sm font-semibold">Nothing scheduled this month</p>
        <p className="text-xs text-muted">Try another month, or clear the filters above.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden cut-sm [--cut-line:var(--border)] border border-border bg-surface">
      {groups.map((group, i) => {
        const isToday = group.key === todayKey;
        return (
          <section
            key={group.key}
            className={`flex flex-col gap-3 p-4 sm:flex-row sm:gap-6 sm:p-5 ${i > 0 ? "border-t border-border" : ""}`}
          >
            <header className="flex items-baseline gap-2 sm:w-16 sm:shrink-0 sm:flex-col sm:gap-1 sm:pt-2">
              <span
                className={`font-display text-2xl leading-none font-bold tabular-nums sm:text-[32px] ${isToday ? "text-foreground" : ""}`}
              >
                {group.date.getDate()}
              </span>
              <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">
                {group.date.toLocaleDateString("en-NG", { weekday: "short" })}
                {isToday && <span className="ml-1.5 text-foreground">· Today</span>}
              </span>
            </header>
            <ol className="flex min-w-0 flex-1 flex-col gap-3">
              {group.events.map((event, j) => (
                <AgendaRow key={`${event.kind}-${event.id}`} event={event} last={j === group.events.length - 1} />
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
