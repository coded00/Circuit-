/**
 * Circuit — shared "open Challenge" card, used by both the homepage's Open
 * Challenges carousel and the full `/battles` board. One component so both
 * surfaces render the exact same head-to-head visual system: host on the
 * left, a real "VS", an empty dashed slot on the right standing in for
 * whoever accepts. There's no separate "matched" variant of this card —
 * both callers query `status: "OPEN"` only, so a Battle that's already
 * been accepted never reaches either list; the Challenge detail page is
 * the only place a real, filled-in matchup ever renders.
 *
 * Stake shown when the Battle is real staked money (`Battle.stakeAmount`
 * > 0, escrowed at creation — see the creation route's own comment);
 * otherwise the footer says "Free entry" plainly, same as before staking
 * existed.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { StatusPill } from "@/components/StatusPill";

function formatLabel(format: string): string {
  return format === "BEST_OF_3" ? "Best of 3" : "Single match";
}

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

export function ChallengeCard({
  battle,
}: {
  battle: {
    id: string;
    game: string;
    format: string;
    visibility: string;
    stakeAmount: number;
    creator: { displayName: string; avatarUrl: string | null };
  };
}) {
  return (
    <Link
      href={`/battles/${battle.id}`}
      data-surface="dark"
      className="group relative flex h-full w-full flex-col gap-3 overflow-hidden rounded-[16px] border border-border bg-surface p-4 transition duration-[var(--duration-base)] ease-[var(--ease-standard)] hover:border-border-hover hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] active:duration-[var(--duration-instant)]"
    >
      <GameArtTile game={battle.game} className="opacity-[0.12]" fill hideLabel imgWidth={480} />

      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-bold tracking-wide text-muted uppercase">{battle.game}</span>
        <StatusPill tone="live" pulse>
          Open
        </StatusPill>
      </div>

      <div className="relative z-10 flex items-center justify-center gap-2">
        <div className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-[10px] font-semibold tracking-wide text-accent-volt uppercase">Host</span>
          {battle.creator.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
            <img
              src={battle.creator.avatarUrl}
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 rounded-full border-2 border-accent-volt/50 object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-accent-volt/50 bg-surface-elevated text-sm font-semibold text-muted">
              {battle.creator.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="w-full truncate text-center text-xs font-medium text-foreground">
            {battle.creator.displayName}
          </span>
        </div>

        <span className="font-display shrink-0 pb-4 text-sm font-bold text-muted">VS</span>

        <div className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-[10px] font-semibold tracking-wide text-accent-orange uppercase">Open slot</span>
          <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-border-strong text-base font-bold text-muted">
            ?
          </div>
          <span className="w-full truncate text-center text-xs text-muted">
            {battle.visibility === "FRIENDS" ? "Friends only" : "Anyone"}
          </span>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-center gap-2 text-[11px] text-muted">
        <span className={battle.stakeAmount > 0 ? "font-semibold text-gold" : undefined}>
          {battle.stakeAmount > 0 ? `${formatNaira(battle.stakeAmount)} stake` : "Free entry"}
        </span>
        <span aria-hidden>·</span>
        <span>{formatLabel(battle.format)}</span>
      </div>

      <span className="btn-primary relative z-10 mt-auto w-full text-sm">
        Accept Challenge
        <ArrowRight size={14} className="transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)] group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
