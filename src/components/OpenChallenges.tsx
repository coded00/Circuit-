import Link from "next/link";
import { Swords } from "lucide-react";
import { AutoScrollRow } from "@/components/AutoScrollRow";
import { ChallengeCard } from "@/components/ChallengeCard";

/**
 * Circuit — "Open Challenges" homepage section. Real, free `Battle` data
 * (the existing `/battles` feature, now user-facing as "Challenges") — the
 * exact same `ChallengeCard` the full `/battles` board renders, at
 * carousel scale. See that component's own header comment for what's real
 * vs. deliberately not invented (no prize pool, no rating number, no
 * countdown).
 */

type Battle = {
  id: string;
  game: string;
  format: string;
  creator: { displayName: string; avatarUrl: string | null };
};

export function OpenChallenges({ battles }: { battles: Battle[] }) {
  if (battles.length === 0) return null;
  const items = battles.map((b) => (
    <div key={b.id} className="h-full w-60">
      <ChallengeCard battle={b} />
    </div>
  ));

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
      <div className="border-b border-border" />

      <AutoScrollRow items={items} ariaLabel="Open Challenges" />
    </section>
  );
}
