import Link from "next/link";
import { Users } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { FriendButton } from "@/components/FriendButton";
import type { DiscoveryPlayer } from "@/lib/discovery";

/**
 * Circuit — Discover Players card (Phase 1). Same `.card-media card-hover`
 * shape /compete's tournament cards use, adapted for a person instead of
 * an event: a short game-art strip for "what they play" (only rendered
 * when a real primaryGame exists — never a fabricated placeholder game),
 * an overlapping avatar, and only the real stats/signals that actually
 * apply to this player (win/loss and mutual-friend lines are omitted, not
 * shown as 0, when genuinely absent).
 */
export function PlayerDiscoveryCard({ player }: { player: DiscoveryPlayer }) {
  const hasRecord = player.wins + player.losses > 0;

  return (
    <div className="card-media card-hover flex h-full flex-col">
      {player.primaryGame ? (
        <div className="relative h-16 w-full overflow-hidden">
          <GameArtTile game={player.primaryGame} className="h-full w-full" />
        </div>
      ) : (
        <div className="h-16 w-full bg-surface-elevated" />
      )}

      <div className="flex flex-1 flex-col gap-2 p-3 pt-0">
        <Link href={`/players/${player.handle}`} className="-mt-6 flex flex-col items-start gap-2">
          {player.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
            <img
              src={player.avatarUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-full border-2 border-surface object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-surface bg-surface-elevated text-lg font-semibold text-muted">
              {player.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold hover:underline">{player.displayName}</span>
            <span className="truncate text-xs text-muted">@{player.handle}</span>
          </span>
        </Link>

        {player.bio && <p className="line-clamp-1 text-xs text-muted">{player.bio}</p>}

        <div className="mt-auto flex flex-col gap-1.5">
          {(hasRecord || player.mutualFriends > 0) && (
            <div className="flex items-center gap-3 text-metadata">
              {hasRecord && (
                <span>
                  {player.wins}–{player.losses}
                </span>
              )}
              {player.mutualFriends > 0 && (
                <span className="flex items-center gap-1">
                  <Users size={11} />
                  {player.mutualFriends} mutual
                </span>
              )}
            </div>
          )}
          <FriendButton targetHandle={player.handle} status={player.friendStatus} />
        </div>
      </div>
    </div>
  );
}
