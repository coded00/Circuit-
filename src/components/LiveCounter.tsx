/**
 * Circuit — LiveCounter ("X players online right now"). Costs a single
 * COUNT query.
 */

export function LiveCounter({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <span className="live-dot" aria-hidden />
      <span>
        <span className="text-stat font-semibold text-foreground">{count.toLocaleString("en-NG")}</span> {label}
      </span>
    </div>
  );
}
