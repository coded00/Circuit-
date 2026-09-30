/**
 * Circuit — one open Challenge as an opponent card. Shared by the /battles
 * board and the homepage's Open challenges.
 *
 * It leads with who you would be playing, because that is what decides
 * whether to accept: their name and their win-loss record in this game. The
 * stake sits opposite (with the pot the winner takes), then the game, format
 * and age, and an Accept button. Every listed challenge is open (accepted
 * ones never reach a list), so there is no status badge. The whole card is
 * the link; the button is only a button in looks.
 */

import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { potOf, timeAgo, winRate } from "@/lib/challengeView";

export type ChallengeCardData = {
  id: string;
  game: string;
  format: string;
  visibility: string;
  stakeAmount: number;
  createdAt: Date;
  creator: { displayName: string; handle: string; avatarUrl: string | null };
};

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function ChallengeCard({ battle: b, record, mine = false }: { battle: ChallengeCardData; record: { wins: number; losses: number } | null; mine?: boolean }) {
  const rate = record ? winRate(record.wins, record.losses) : null;
  const staked = b.stakeAmount > 0;
  // The card adapts to the room it's given (a container query, not the screen): stacked when narrow,
  // which is what lets three sit side by side on the homepage, and laid out across when wide.
  return (
    <div className="@container">
      <Link
        href={`/battles/${b.id}`}
        className="group grid h-full grid-cols-[auto_1fr] gap-x-3 gap-y-4 rounded-[14px] border border-border bg-surface p-4 transition duration-[var(--duration-fast)] hover:border-border-strong hover:shadow-[0_6px_20px_-12px_rgba(17,19,24,0.35)] focus-visible:ring-2 focus-visible:ring-accent-volt focus-visible:outline-none @min-[360px]:grid-cols-[auto_1fr_auto]"
      >
        <PlayerAvatar person={b.creator} size="md" className="!h-[52px] !w-[52px] !text-lg" />

        <div className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-semibold" title={b.creator.displayName}>
              {b.creator.displayName}
            </span>
            {mine && <span className="badge shrink-0 bg-accent-volt-soft text-foreground">Yours</span>}
          </span>
          <span className="truncate font-mono text-xs text-muted">@{b.creator.handle}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {rate !== null && record ? (
              <>
                <span className="font-display text-base font-bold tabular-nums">
                  <span className="text-success">{record.wins}W</span> <span className="text-muted">{record.losses}L</span>
                </span>
                <span className="text-muted">
                  {rate}% in {b.game}
                </span>
              </>
            ) : (
              <span className="rounded-full bg-accent-volt-soft px-2 py-0.5 font-semibold text-foreground">New to {b.game}</span>
            )}
          </span>
        </div>

        <div className="col-span-2 flex items-baseline justify-between gap-3 border-t border-border pt-3 @min-[360px]:col-span-1 @min-[360px]:flex-col @min-[360px]:items-end @min-[360px]:justify-start @min-[360px]:border-t-0 @min-[360px]:pt-0">
          <span className={`font-display text-2xl leading-none font-bold tabular-nums ${staked ? "text-gold" : "text-success"}`}>{staked ? formatNaira(b.stakeAmount) : "Free"}</span>
          {staked ? (
            <span className="text-[11px] text-muted @min-[360px]:mt-1" title="Both players stake the same amount. The winner takes the whole pot.">
              pot {formatNaira(potOf(b.stakeAmount))}
            </span>
          ) : (
            <span className="text-[11px] text-muted @min-[360px]:hidden">no stake</span>
          )}
        </div>

        <div className="col-span-2 flex flex-col gap-3 @min-[360px]:col-span-3 @min-[360px]:flex-row @min-[360px]:items-center @min-[360px]:justify-between">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="font-semibold text-foreground">{b.game}</span>
            <span>{b.format === "BEST_OF_3" ? "Best of 3" : "Single match"}</span>
            {b.visibility === "FRIENDS" && (
              <span className="flex items-center gap-1 whitespace-nowrap">
                <Users size={11} aria-hidden />
                Friends only
              </span>
            )}
            <span>{timeAgo(b.createdAt)}</span>
          </span>
          <span className={`${mine ? "btn-secondary" : "btn-primary"} min-h-[44px] w-full shrink-0 px-4 text-sm @min-[360px]:w-auto`}>
            {mine ? "View" : "Accept"}
            <ArrowRight size={14} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </div>
  );
}
