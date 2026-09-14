/**
 * Circuit — real registrant-count-vs-cap as an animated fill bar, shared
 * by every card/page that already shows this number as text (the bar is
 * additive, not a replacement — see each caller). Color reflects real
 * fullness, not decoration: blue while there's room, orange as it fills,
 * gold once full — the same `_count.registrations`/`participantCap`
 * numbers every caller already had.
 */
export function CapacityBar({
  registered,
  cap,
  className = "h-[3px]",
}: {
  registered: number;
  cap: number;
  /** Track height/spacing — callers keep their own existing sizing rather
   *  than all converging on one bar thickness. */
  className?: string;
}) {
  const pct = cap > 0 ? Math.min(100, Math.round((registered / cap) * 100)) : 0;
  const fillColor = pct >= 100 ? "bg-gold" : pct >= 60 ? "bg-accent-orange" : "bg-accent-blue";

  return (
    <div className={`w-full overflow-hidden rounded-full bg-surface-elevated ${className}`}>
      <div
        className={`capacity-fill h-full rounded-full ${fillColor}`}
        style={{ "--fill-pct": `${pct}%` } as React.CSSProperties}
      />
    </div>
  );
}
