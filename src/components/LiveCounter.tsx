/**
 * Circuit — LiveCounter (docs/circuit-ui-references.md: FACEIT's homepage
 * trust signal — "X players online right now" with a pulse dot). Costs a
 * single COUNT query and does more for a first-time organizer's trust
 * than copy would.
 */

export function LiveCounter({ label, count }: { label: string; count: number }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-1.5 text-sm text-muted backdrop-blur-sm">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-live opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-status-live" />
      </span>
      <span>
        <span className="font-semibold text-foreground">{count.toLocaleString("en-NG")}</span> {label}
      </span>
    </div>
  );
}
