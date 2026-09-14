"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Circuit — real registrant-count-vs-cap as an animated fill bar, shared
 * by every card/page that already shows this number as text (the bar is
 * additive, not a replacement — see each caller). Color reflects real
 * fullness, not decoration: blue while there's room, orange as it fills,
 * gold once full — the same `_count.registrations`/`participantCap`
 * numbers every caller already had.
 *
 * Client component specifically so it can tell a genuine change in
 * `registered` (a page with a <Poller> refreshing real data) apart from
 * its own first mount — only the former gets the brief highlight flash;
 * an initial page load just shows the real number, it didn't "change"
 * from anything.
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

  const previous = useRef(registered);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (previous.current === registered) return;
    previous.current = registered;
    setFlash(true);
    const timeout = setTimeout(() => setFlash(false), 700);
    return () => clearTimeout(timeout);
  }, [registered]);

  return (
    <div className={`w-full overflow-hidden rounded-full bg-surface-elevated ${className}`}>
      <div
        className={`capacity-fill h-full rounded-full ${fillColor} ${flash ? "capacity-flash" : ""}`}
        style={{ "--fill-pct": `${pct}%` } as React.CSSProperties}
      />
    </div>
  );
}
