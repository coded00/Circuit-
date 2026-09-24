/**
 * Circuit — a row of headline numbers separated by hairlines (the profile
 * header's record/win-rate strip, the wallet's totals, a match's details).
 * Mono numerals, eyebrow labels, optional sub-line; no icon tiles.
 */

export type Stat = { label: string; value: React.ReactNode; sub?: React.ReactNode; valueClassName?: string };

export function StatStrip({
  stats,
  columns = "grid-cols-2 sm:grid-cols-4",
  compact = false,
}: {
  stats: Stat[];
  /** Smaller numerals/padding on phones — for 3+ columns at mobile width. */
  compact?: boolean;
  /** Full grid-cols classes — pick a count that divides evenly at each size. */
  columns?: string;
}) {
  return (
    <dl className={`grid gap-px border-t border-border bg-border ${columns}`}>
      {stats.map((s) => (
        <div key={s.label} className={`flex min-w-0 flex-col gap-1 bg-surface py-4 sm:px-7 ${compact ? "px-3" : "px-4"}`}>
          <dt className={`text-eyebrow text-muted ${compact ? "text-[10px] tracking-[0.08em] sm:text-[11px] sm:tracking-[0.14em]" : ""}`}>{s.label}</dt>
          <dd className={`text-stat leading-tight [overflow-wrap:anywhere] sm:text-2xl sm:leading-none ${compact ? "text-base" : "text-xl"} ${s.valueClassName ?? ""}`}>{s.value}</dd>
          {s.sub && <dd className="truncate text-xs text-muted">{s.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}
