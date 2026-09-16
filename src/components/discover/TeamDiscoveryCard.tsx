import Link from "next/link";
import { Users } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { TeamMembershipButton } from "@/components/teams/TeamMembershipButton";
import type { DiscoveryTeam } from "@/lib/teamDiscovery";

/**
 * Circuit — Discover Teams card (Phase 3). Same `.card-media card-hover`
 * shape as PlayerDiscoveryCard, adapted for a team: a game-art strip when
 * a real game is set, name/tag, real member count, captain, and the
 * shared TeamMembershipButton. No rank/results section — Team has no
 * wired-up competitive results at all (see teamDiscovery.ts's own
 * comment), so there's nothing real to show there.
 */
export function TeamDiscoveryCard({ team, viewerId }: { team: DiscoveryTeam; viewerId: string }) {
  return (
    <div className="card-media card-hover flex h-full flex-col">
      {team.game ? (
        <div className="relative h-16 w-full overflow-hidden">
          <GameArtTile game={team.game} className="h-full w-full" hideLabel />
        </div>
      ) : (
        <div className="h-16 w-full bg-surface-elevated" />
      )}

      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link href={`/teams/${team.id}`} className="flex flex-col">
          <span className="truncate text-sm font-semibold hover:underline">
            {team.name}
            {team.tag && <span className="text-muted"> [{team.tag}]</span>}
          </span>
          <span className="truncate text-xs text-muted">
            {team.game ? `${team.game} · ` : ""}
            Captained by {team.captainDisplayName}
          </span>
        </Link>

        <div className="mt-auto flex flex-col gap-1.5">
          <div className="flex items-center gap-3 text-metadata">
            <span className="flex items-center gap-1">
              <Users size={11} />
              {team.memberCount} member{team.memberCount === 1 ? "" : "s"}
            </span>
            {team.region && <span>{team.region}</span>}
          </div>
          <TeamMembershipButton teamId={team.id} viewerId={viewerId} status={team.membershipStatus} />
        </div>
      </div>
    </div>
  );
}
