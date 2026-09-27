import Link from "next/link";
import { Crown, MapPin, Users } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { TeamMembershipButton } from "@/components/teams/TeamMembershipButton";
import type { DiscoveryTeam } from "@/lib/teamDiscovery";

/**
 * Circuit — Discover team card: the team's tag as a crest over its game
 * banner, then real facts only (members, region, captain). No rank or
 * results — Team has no competitive results wired up (see
 * teamDiscovery.ts), so nothing is invented there.
 */
export function TeamDiscoveryCard({ team, viewerId }: { team: DiscoveryTeam; viewerId: string }) {
  const crest = (team.tag || team.name).replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() || "?";

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-[16px] border border-border bg-surface transition duration-[var(--duration-base)] hover:-translate-y-0.5 hover:border-border-hover">
      <Link href={`/teams/${team.id}`} className="relative block h-24 w-full overflow-hidden" tabIndex={-1} aria-hidden>
        {team.game ? (
          <GameArtTile game={team.game} className="h-full w-full transition-transform duration-[var(--duration-moderate)] group-hover:scale-[1.04]" hideLabel />
        ) : (
          <div className="h-full w-full bg-[#15181d] bg-[radial-gradient(90%_120%_at_85%_0%,color-mix(in_srgb,var(--accent-orange)_30%,transparent),transparent_65%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        {team.game && (
          <span className="absolute right-2.5 bottom-2 max-w-[60%] truncate rounded-[6px] bg-black/55 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] text-white uppercase backdrop-blur-sm">
            {team.game}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
        <Link href={`/teams/${team.id}`} className="relative z-10 -mt-8 flex flex-col items-start gap-2">
          <span className="font-display flex h-16 w-16 shrink-0 items-center justify-center rounded-[14px] border-[3px] border-surface bg-accent-volt text-lg font-bold tracking-tight text-accent-volt-foreground">
            {crest}
          </span>
          <span className="flex w-full min-w-0 flex-col">
            <span className="truncate font-display text-base leading-tight font-bold tracking-tight group-hover:underline">{team.name}</span>
            {team.tag && <span className="truncate font-mono text-xs text-muted">[{team.tag}]</span>}
          </span>
        </Link>

        <ul className="flex flex-col gap-1.5 text-[13px] text-muted">
          <li className="flex items-center gap-2">
            <Users size={13} className="shrink-0" />
            {team.memberCount} member{team.memberCount === 1 ? "" : "s"}
          </li>
          <li className="flex min-w-0 items-center gap-2">
            <Crown size={13} className="shrink-0" />
            <span className="truncate">Captain {team.captainDisplayName}</span>
          </li>
          {team.region && (
            <li className="flex min-w-0 items-center gap-2">
              <MapPin size={13} className="shrink-0" />
              <span className="truncate">{team.region}</span>
            </li>
          )}
        </ul>

        <div className="mt-auto border-t border-border pt-3">
          <TeamMembershipButton teamId={team.id} viewerId={viewerId} status={team.membershipStatus} />
        </div>
      </div>
    </div>
  );
}
