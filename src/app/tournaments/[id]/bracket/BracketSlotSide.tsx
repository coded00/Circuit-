"use client";

import { useEffect, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import { Avatar, type Player } from "./BracketView";

/**
 * One side of a bracket match slot. Split out as its own client component
 * for exactly one reason: the bracket page already polls (<Poller />,
 * 5s refresh), so a slot can genuinely go from empty ("TBD", waiting on
 * the previous round) to a real player mid-session. Tracking the previous
 * player id lets that real advancement get a brief reveal — never on
 * initial mount, and never when the slot was already filled before this
 * poll (same useRef-previous-value pattern as CapacityBar's change flash).
 */
export function BracketSlotSide({
  player,
  isWinner,
  borderClass,
}: {
  player: Player | null;
  isWinner: boolean;
  borderClass: string;
}) {
  const previousId = useRef(player?.id ?? null);
  const [justFilled, setJustFilled] = useState(false);

  useEffect(() => {
    const currentId = player?.id ?? null;
    if (previousId.current === currentId) return;
    const wasEmpty = previousId.current === null;
    previousId.current = currentId;
    if (!wasEmpty || !currentId) return;
    setJustFilled(true);
    const timeout = setTimeout(() => setJustFilled(false), 900);
    return () => clearTimeout(timeout);
  }, [player?.id]);

  return (
    <div
      className={`flex h-9 items-center gap-2 px-3 text-sm ${borderClass} ${
        isWinner ? "font-semibold text-foreground" : "text-muted"
      } ${justFilled ? "motion-scale-in" : ""}`}
    >
      <Avatar player={player} size={22} ringClass={isWinner ? "border-accent-volt/60" : "border-border"} />
      <span className="truncate">{player?.displayName ?? "TBD"}</span>
      {isWinner && <Trophy size={13} className="ml-auto shrink-0 text-gold" />}
    </div>
  );
}
