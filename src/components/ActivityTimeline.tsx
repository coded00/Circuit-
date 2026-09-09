/**
 * Circuit — ActivityTimeline. Terse, one-line-per-event, oldest to
 * newest. An auditable log of what happened and when (dispute
 * resolution, auto-accept).
 */

export type TimelineEvent = {
  at: Date;
  label: string;
};

function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

export function ActivityTimeline({ events }: { events: TimelineEvent[] }) {
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());

  if (sorted.length === 0) {
    return <p className="text-sm text-muted">Nothing has happened yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {sorted.map((event, i) => (
        <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-l-2 border-border pl-3 text-sm">
          <span>{event.label}</span>
          <span className="text-metadata shrink-0">{formatTimestamp(event.at)}</span>
        </li>
      ))}
    </ol>
  );
}
