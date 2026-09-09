import Link from "next/link";
import { Swords, Tv } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { AutoScrollRow } from "@/components/AutoScrollRow";

/**
 * Circuit — "Open Challenges" homepage section (MVP rework spec section
 * 16). Real, free `Battle` data (the existing `/battles` feature, now
 * user-facing as "Challenges") — Challenge Orange as the section accent,
 * per spec. Card shell follows `CompeteOnCircuit`'s pattern, adapted from
 * tournament fields to battle fields.
 */

type Battle = {
  id: string;
  game: string;
  format: string;
  streamUrl: string | null;
  creator: { displayName: string };
  targetUser: { displayName: string } | null;
};

function formatLabel(format: string): string {
  return format === "BEST_OF_3" ? "Best of 3" : "Single match";
}

function ChallengeCard({ battle }: { battle: Battle }) {
  return (
    <Link href={`/battles/${battle.id}`} className="card-media card-hover flex h-full w-64 flex-col">
      <div className="relative h-24 w-full overflow-hidden">
        <span className="badge absolute top-2 left-2 z-10 bg-accent-orange-soft text-accent-orange">
          <Swords size={11} />
          Open
        </span>
        <GameArtTile game={battle.game} className="h-full w-full" />
      </div>
      <div className="flex flex-col gap-1 p-3">
        <span className="text-card-title truncate font-semibold">{battle.game}</span>
        <span className="truncate text-xs text-muted">
          {battle.creator.displayName} vs {battle.targetUser?.displayName ?? "Anyone"}
        </span>
        <div className="flex items-center justify-between text-metadata">
          <span>{formatLabel(battle.format)}</span>
          {battle.streamUrl && <Tv size={11} />}
        </div>
        <span className="mt-1 text-center text-sm font-semibold text-accent-orange">Accept Challenge →</span>
      </div>
    </Link>
  );
}

export function OpenChallenges({ battles }: { battles: Battle[] }) {
  if (battles.length === 0) return null;
  const items = battles.map((b) => <ChallengeCard key={b.id} battle={b} />);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-section-heading flex items-center gap-2">
            <Swords size={17} className="text-accent-orange" />
            Open Challenges
          </h2>
          <p className="text-metadata">Take on another player, right now.</p>
        </div>
        <Link href="/battles" className="text-xs font-medium text-accent-orange hover:underline">
          View All →
        </Link>
      </div>

      <AutoScrollRow items={items} ariaLabel="Open Challenges" />
    </section>
  );
}
