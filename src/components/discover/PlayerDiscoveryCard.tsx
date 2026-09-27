import Link from "next/link";
import { Users } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { FriendButton } from "@/components/FriendButton";
import type { DiscoveryPlayer } from "@/lib/discovery";

/**
 * Circuit — Discover player card, laid out like a roster card: the game
 * they play as a banner, a rounded-square avatar breaking out of it, then
 * only the real signals that apply (record, win rate, mutual friends) —
 * nothing shown as 0 or invented. A player with no matches yet is marked
 * as new rather than given an empty stat line.
 */
export function PlayerDiscoveryCard({ player }: { player: DiscoveryPlayer }) {
  const played = player.wins + player.losses;
  const winRate = played > 0 ? Math.round((player.wins / played) * 100) : null;

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-[16px] border border-border bg-surface transition duration-[var(--duration-base)] hover:-translate-y-0.5 hover:border-border-hover">
      <Link href={`/players/${player.handle}`} className="relative block h-24 w-full overflow-hidden" tabIndex={-1} aria-hidden>
        {player.primaryGame ? (
          <GameArtTile game={player.primaryGame} className="h-full w-full transition-transform duration-[var(--duration-moderate)] group-hover:scale-[1.04]" hideLabel />
        ) : (
          <div className="h-full w-full bg-[#15181d] bg-[radial-gradient(90%_120%_at_15%_0%,color-mix(in_srgb,var(--accent-volt)_28%,transparent),transparent_65%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        {player.primaryGame && (
          <span className="absolute right-2.5 bottom-2 max-w-[60%] truncate rounded-[6px] bg-black/55 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] text-white uppercase backdrop-blur-sm">
            {player.primaryGame}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
        <Link href={`/players/${player.handle}`} className="relative z-10 -mt-8 flex flex-col items-start gap-2">
          {player.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
            <img src={player.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-16 w-16 shrink-0 rounded-[14px] border-[3px] border-surface object-cover" />
          ) : (
            <span className="font-display flex h-16 w-16 shrink-0 items-center justify-center rounded-[14px] border-[3px] border-surface bg-[#111318] text-2xl font-bold text-accent-volt dark:bg-surface-elevated">
              {player.displayName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="flex w-full min-w-0 flex-col">
            <span className="truncate font-display text-base leading-tight font-bold tracking-tight group-hover:underline">{player.displayName}</span>
            <span className="truncate font-mono text-xs text-muted">@{player.handle}</span>
          </span>
        </Link>

        {player.bio ? <p className="line-clamp-2 text-[13px] leading-snug text-muted">{player.bio}</p> : null}

        <dl className="mt-auto flex items-center gap-4 border-t border-border pt-3">
          {winRate !== null ? (
            <>
              <div className="flex flex-col">
                <dt className="font-mono text-[10px] tracking-[0.12em] text-muted-strong uppercase">Record</dt>
                <dd className="font-display text-sm font-bold tabular-nums">
                  {player.wins}–{player.losses}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="font-mono text-[10px] tracking-[0.12em] text-muted-strong uppercase">Win rate</dt>
                <dd className="font-display text-sm font-bold tabular-nums">{winRate}%</dd>
              </div>
            </>
          ) : (
            <span className="rounded-[6px] bg-accent-volt-soft px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.12em] text-foreground uppercase">New player</span>
          )}
          {player.mutualFriends > 0 && (
            <span className="ml-auto flex items-center gap-1 text-xs text-muted">
              <Users size={12} />
              {player.mutualFriends} mutual
            </span>
          )}
        </dl>
        <FriendButton targetHandle={player.handle} status={player.friendStatus} />
      </div>
    </div>
  );
}
