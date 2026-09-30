/**
 * Circuit — one open Challenge as a fight card. Shared by the /battles board
 * and the homepage's Open challenges, so both read the same.
 *
 * The purse is the loudest thing on it: the stake each player puts up and
 * what the winner takes home. The challenger stands on one side, an empty
 * dashed slot waits on the other for whoever accepts, and the game's art
 * sits behind it all, dimmed so the numbers stay readable. Every challenge
 * in a list is open (accepted ones never reach it), so there is no status
 * badge. The biggest purse can be `featured`: a wider card with bigger type.
 */

import Link from "next/link";
import { ArrowRight, Plus, Swords, Users } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { formatStake, potOf, timeAgo } from "@/lib/challengeView";

export type ChallengeCardData = {
  id: string;
  game: string;
  format: string;
  visibility: string;
  stakeAmount: number;
  createdAt: Date;
  creator: { displayName: string; avatarUrl: string | null };
};

export function ChallengeCard({
  battle: b,
  mine = false,
  featured = false,
  wide = false,
}: {
  battle: ChallengeCardData;
  mine?: boolean;
  /** The biggest purse: wider, with bigger type. */
  featured?: boolean;
  /** Spans both columns without the bigger type, for a card that would otherwise sit alone on its row. */
  wide?: boolean;
}) {
  const staked = b.stakeAmount > 0;
  return (
    <Link
      href={`/battles/${b.id}`}
      data-surface="dark"
      className={`group relative isolate flex flex-col gap-6 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-background p-5 transition duration-[var(--duration-base)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:border-accent-volt/50 focus-visible:ring-2 focus-visible:ring-accent-volt/60 focus-visible:outline-none active:translate-y-0 active:scale-[0.99] ${
        featured ? "sm:col-span-2 sm:p-7" : wide ? "sm:col-span-2" : ""
      }`}
    >
      <GameArtTile game={b.game} fill hideLabel imgWidth={featured ? 900 : 560} className="-z-20 opacity-45 transition-transform duration-500 group-hover:scale-[1.04]" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/85 to-background/45" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs">
          <span className="truncate text-sm font-semibold text-foreground">{b.game}</span>
          <span className="flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 font-medium text-foreground">
            <Swords size={11} aria-hidden />
            {b.format === "BEST_OF_3" ? "Best of 3" : "Single match"}
          </span>
          {b.visibility === "FRIENDS" && (
            <span className="flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 font-medium text-foreground">
              <Users size={11} aria-hidden />
              Friends only
            </span>
          )}
        </div>
        <span className="shrink-0 pt-0.5 text-xs text-muted">{timeAgo(b.createdAt)}</span>
      </div>

      <div className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 ${featured ? "sm:gap-8 sm:py-2" : wide ? "sm:mx-auto sm:w-full sm:max-w-xl sm:gap-8" : ""}`}>
        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          <PlayerAvatar
            person={b.creator}
            size={featured ? "lg" : "md"}
            className={`ring-2 ring-accent-volt/60 ring-offset-2 ring-offset-background ${featured ? "" : "!h-14 !w-14 !text-lg"}`}
          />
          <span className="flex w-full min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold" title={b.creator.displayName}>{b.creator.displayName}</span>
            <span className="text-[11px] text-muted">{mine ? "You" : "Challenger"}</span>
          </span>
        </div>

        <div className="flex flex-col items-center gap-1 text-center">
          <span className="font-display text-[11px] font-bold tracking-[0.2em] text-muted">VS</span>
          {staked ? (
            <>
              <span className={`font-display leading-none font-bold tracking-tight whitespace-nowrap text-gold tabular-nums ${featured ? "text-[34px] sm:text-6xl" : "text-[34px]"}`}>
                {formatStake(b.stakeAmount)}
              </span>
              <span className="text-[11px] whitespace-nowrap text-muted">
                <span className="hidden sm:inline">each, </span>winner takes {formatStake(potOf(b.stakeAmount))}
              </span>
            </>
          ) : (
            <>
              <span className={`font-display leading-none font-bold tracking-tight text-success ${featured ? "text-[34px] sm:text-6xl" : "text-[34px]"}`}>Free</span>
              <span className="text-[11px] whitespace-nowrap text-muted">just bragging rights</span>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          <span
            className={`flex items-center justify-center rounded-full border-2 border-dashed border-border-strong text-muted transition group-hover:border-accent-volt group-hover:text-accent-volt ${
              featured ? "h-16 w-16 sm:h-24 sm:w-24" : "h-14 w-14"
            }`}
          >
            <Plus size={featured ? 28 : 20} aria-hidden />
          </span>
          <span className="flex w-full min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold text-muted transition group-hover:text-foreground">Open slot</span>
            <span className="text-[11px] text-muted">{mine ? "Still open" : "Could be you"}</span>
          </span>
        </div>
      </div>

      <span className={`${mine ? "btn-secondary" : "btn-primary"} mt-auto w-full text-sm`}>
        {mine ? "Manage your challenge" : "Accept challenge"}
        <ArrowRight size={14} aria-hidden className="transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)] group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
