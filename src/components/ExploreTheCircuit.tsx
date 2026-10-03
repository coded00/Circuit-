import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { sized } from "@/lib/imageUrl";
import { GameArtTile } from "@/components/GameArtTile";
import { SectionHeader } from "@/components/ui/SectionHeader";

/**
 * Circuit — homepage "Games" row: the published game catalog (Admin →
 * Games), each with its real number of open tournaments. Each tile shows the
 * game's square logo (the small image uploaded for it); a game with no logo
 * falls back to its cover art. A tile opens that game's tournaments on
 * /compete; the last tile goes to the official community hubs. Hidden when
 * nothing is published yet.
 */

export type GameCount = { name: string; iconUrl: string | null; activeCompetitions: number };

const TILE = "group cut-sm flex w-24 shrink-0 flex-col overflow-hidden border border-border bg-surface transition duration-[var(--duration-base)] ease-[var(--ease-standard)] [--cut-line:var(--border)] hover:-translate-y-0.5 hover:border-border-hover active:translate-y-0 active:scale-[0.99]";

function GameTile({ name, iconUrl, activeCompetitions }: GameCount) {
  return (
    <Link href={`/compete?game=${encodeURIComponent(name)}`} className={TILE}>
      <div className="relative aspect-square w-full overflow-hidden bg-surface-elevated">
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded game logo, arbitrary host and size
          <img src={sized(iconUrl, 112) ?? iconUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-[var(--duration-reveal)] group-hover:scale-[1.05]" />
        ) : (
          <GameArtTile thumb game={name} hideLabel fill className="h-full w-full" />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
        <span className="truncate font-display text-sm leading-none font-bold tracking-tight uppercase">{name}</span>
        <span className={`truncate text-[11px] ${activeCompetitions > 0 ? "text-accent-volt" : "text-muted"}`}>
          {activeCompetitions === 0 ? "No open tournaments" : `${activeCompetitions} open`}
        </span>
      </div>
    </Link>
  );
}

export function ExploreTheCircuit({ games }: { games: GameCount[] }) {
  if (games.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title="Games" href="/compete" linkLabel="All tournaments" />
      <div data-stagger className="flex flex-wrap gap-3">
        {games.slice(0, 11).map((g) => (
          <GameTile key={g.name} {...g} />
        ))}
        <Link href="/communities" className={TILE}>
          <div className="flex aspect-square w-full items-center justify-center bg-surface-elevated text-muted transition group-hover:text-accent-volt">
            <LayoutGrid size={32} aria-hidden />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
            <span className="truncate font-display text-sm leading-none font-bold tracking-tight uppercase">Game hubs</span>
            <span className="truncate text-[11px] text-accent-blue">Find your community</span>
          </div>
        </Link>
      </div>
    </section>
  );
}
