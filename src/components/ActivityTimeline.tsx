/**
 * Circuit — ActivityTimeline (docs/circuit-ui-references.md: Linear's
 * activity timeline — terse, one-line-per-event, oldest to newest. Called
 * out as "close to a direct requirement, not just inspiration" for BRK-5's
 * dispute resolution and BRK-10's auto-accept — an auditable log of what
 * happened and when.
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
        <li key={i} className="flex gap-3 text-sm">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" />
          <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span>{event.label}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{formatTimestamp(event.at)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
