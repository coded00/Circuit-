import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { AutoScrollRow } from "@/components/AutoScrollRow";

/**
 * Circuit — "Explore by Game" homepage section (MVP rework spec section
 * 14). Games shown are the small, fixed, curated set with real cover
 * photos (see gameImagery.ts) — the same set `GameCounts` below is
 * computed for in page.tsx via a real per-game count of OPEN/LIVE
 * tournaments, replacing the old "X connected now" illustrative figure
 * with "X Active Competitions" (real data).
 *
 * These tiles are real functionality: each links into `/compete`'s real
 * `?game=` filter, so exploring by game actually filters the real
 * tournament feed.
 */

export type GameCount = { name: string; activeCompetitions: number };

function GameTile({ name, activeCompetitions }: GameCount) {
  return (
    <Link href={`/compete?game=${encodeURIComponent(name)}`} className="card-media relative block h-[105px] w-[170px]">
      {/* GameArtTile's own label sits flush at the bottom (bottom-2) —
          stack this above it (bottom-6) rather than on the same row. */}
      <GameArtTile game={name} className="h-full w-full" />
      <span className="absolute right-3 bottom-6 left-3 z-10 truncate text-[10px] font-medium text-white/70">
        {activeCompetitions} Active Competition{activeCompetitions === 1 ? "" : "s"}
      </span>
    </Link>
  );
}

export function ExploreTheCircuit({ games }: { games: GameCount[] }) {
  const items = [
    ...games.map((g) => <GameTile key={g.name} {...g} />),
    <Link
      key="view-all"
      href="/ladder"
      className="card-media flex h-[105px] w-[170px] flex-col items-center justify-center gap-1.5 text-muted transition hover:text-foreground"
    >
      <ArrowRight size={20} />
      <span className="text-sm font-medium">View All</span>
    </Link>,
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-section-heading">Explore by Game</h2>
        <p className="text-metadata">Discover the games and competitions happening now.</p>
      </div>

      <AutoScrollRow items={items} ariaLabel="Explore by game" />
    </section>
  );
}
