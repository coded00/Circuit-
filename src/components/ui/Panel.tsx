/**
 * Circuit — the standard titled content block used across the product
 * surfaces (profile, match, wallet, challenges, compete). A `.card` with a
 * header row; the rows inside are separated by hairlines (`PanelRows`)
 * rather than nested cards, which keeps pages calm and scannable.
 */

export function Panel({
  title,
  meta,
  action,
  children,
  className = "",
}: {
  title: string;
  /** Small mono count/label beside the title (e.g. "12", "3/4"). */
  meta?: React.ReactNode;
  /** Right-aligned header control, usually a text link. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card overflow-hidden p-0 ${className}`}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="font-display text-base font-bold tracking-tight">{title}</h2>
          {meta !== undefined && meta !== null && meta !== "" && (
            <span className="font-mono text-xs text-muted tabular-nums">{meta}</span>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Hairline-divided rows directly under a Panel header. */
export function PanelRows({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-border border-t border-border">{children}</div>;
}

/** Padded body directly under a Panel header. */
export function PanelBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`border-t border-border px-5 py-4 ${className}`}>{children}</div>;
}

/** Muted one-line empty state under a Panel header. */
export function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <p className="border-t border-border px-5 py-6 text-sm text-muted">{children}</p>;
}

/** Interactive row inside PanelRows — pass `as` an <a>/<Link> via children wrapper classes. */
export const panelRowClass =
  "group flex items-center gap-3 px-5 py-3 transition-colors duration-[var(--duration-fast)] hover:bg-surface-elevated/60";
