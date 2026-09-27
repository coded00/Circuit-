import Link from "next/link";
import { LayoutGrid, ArrowRight } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { AutoScrollRow } from "@/components/AutoScrollRow";
import { SectionHeader } from "@/components/ui/SectionHeader";

/**
 * Circuit — homepage "Games" row: the published game catalog (Admin →
 * Games), each with its real number of open tournaments, cover art from
 * the catalog (GameArtTile). A tile opens that game's tournaments on
 * /compete; the last tile goes to its official community hubs. Hidden
 * when nothing is published yet.
 */

export type GameCount = { name: string; activeCompetitions: number };

function GameTile({ name, activeCompetitions }: GameCount) {
  return (
    <Link href={`/compete?game=${encodeURIComponent(name)}`} className="card-media relative block h-[105px] w-[170px]">
      {/* GameArtTile's own label sits flush at the bottom (bottom-2) —
          stack this above it (bottom-6) rather than on the same row. */}
      <GameArtTile game={name} className="h-full w-full" />
      <span className="absolute right-3 bottom-6 left-3 z-10 truncate text-[10px] font-medium text-white/70">
        {activeCompetitions === 0 ? "No open tournaments" : `${activeCompetitions} open`}
      </span>
    </Link>
  );
}

export function ExploreTheCircuit({ games }: { games: GameCount[] }) {
  if (games.length === 0) return null;
  const items = [
    ...games.map((g) => <GameTile key={g.name} {...g} />),
    <Link
      key="view-all"
      href="/communities"
      className="card-media flex h-[105px] w-[170px] flex-col items-center justify-center gap-1 text-muted transition hover:text-foreground"
    >
      <LayoutGrid size={20} />
      <span className="text-sm font-semibold text-foreground">Game hubs</span>
      <span className="flex items-center gap-1 text-xs font-medium text-accent-blue">
        Find your game&apos;s community <ArrowRight size={11} />
      </span>
    </Link>,
  ];

  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title="Games" href="/compete" linkLabel="All tournaments" />
      <AutoScrollRow items={items} ariaLabel="Explore by game" />
    </section>
  );
}
