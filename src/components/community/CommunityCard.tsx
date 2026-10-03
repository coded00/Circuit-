import Link from "next/link";
import { BadgeCheck, Gamepad2, Lock, MapPin, MessageCircle, Users } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import type { CommunityCard as CommunityCardData } from "@/lib/communityDirectory";
import { CommunityAvatar } from "./CommunityAvatar";

/**
 * Circuit — a community in discovery: banner (its own, else its game's
 * art), crest, name and only real facts — members, who's been talking
 * this week, where, which game. The whole card links to the community
 * page, where joining happens.
 */
export function CommunityCard({ community: c }: { community: CommunityCardData }) {
  return (
    <Link
      href={c.href}
      className="group flex h-full flex-col overflow-hidden cut-lg [--cut-line:var(--border)] border border-border bg-surface transition duration-[var(--duration-base)] hover:-translate-y-0.5 hover:border-border-hover"
    >
      <div className="relative h-24 w-full overflow-hidden">
        {c.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded or external banner
          <img src={c.bannerUrl} alt="" className="h-full w-full object-cover transition-transform duration-[var(--duration-moderate)] group-hover:scale-[1.04]" />
        ) : c.gameName ? (
          <GameArtTile game={c.gameName} className="h-full w-full transition-transform duration-[var(--duration-moderate)] group-hover:scale-[1.04]" hideLabel />
        ) : (
          <div className="h-full w-full bg-[#15181d] bg-[radial-gradient(90%_120%_at_85%_0%,color-mix(in_srgb,var(--accent-volt)_28%,transparent),transparent_65%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        <div className="absolute top-2.5 right-2.5 flex gap-1.5">
          {c.isMember && <span className="badge badge-solid badge-open">Joined</span>}
          {!c.isMember && c.joinPolicy === "APPLY" && (
            <span className="badge badge-solid badge-neutral flex items-center gap-1">
              <Lock size={10} /> Apply
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-4 pb-4">
        <div className="relative z-10 -mt-8 flex items-end gap-2">
          <CommunityAvatar name={c.name} iconUrl={c.iconUrl} tag={c.tag} size="lg" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-display text-base leading-tight font-bold tracking-tight group-hover:underline">{c.name}</span>
            {c.kind !== "PLAYER" && <BadgeCheck size={15} className="shrink-0 text-accent-volt" aria-label="Official" />}
            {c.tag && <span className="shrink-0 font-mono text-[11px] text-muted">[{c.tag}]</span>}
          </span>
          {c.description && <p className="line-clamp-2 text-[13px] leading-snug text-muted">{c.description}</p>}
        </div>

        <ul className="mt-auto flex flex-col gap-1.5 pt-1 text-[12.5px] text-muted">
          <li className="flex items-center gap-2">
            <Users size={13} className="shrink-0" />
            {c.memberCount.toLocaleString("en-NG")} member{c.memberCount === 1 ? "" : "s"}
          </li>
          {c.activityLabel && (
            <li className="flex items-center gap-2 text-foreground">
              <MessageCircle size={13} className="shrink-0 text-success" />
              {c.activityLabel}
            </li>
          )}
          {c.gameName && c.kind !== "GAME_HUB" && (
            <li className="flex min-w-0 items-center gap-2">
              <Gamepad2 size={13} className="shrink-0" />
              <span className="truncate">{c.gameName}</span>
            </li>
          )}
          {c.region && (
            <li className="flex min-w-0 items-center gap-2">
              <MapPin size={13} className="shrink-0" />
              <span className="truncate">{c.region}</span>
            </li>
          )}
        </ul>
      </div>
    </Link>
  );
}
