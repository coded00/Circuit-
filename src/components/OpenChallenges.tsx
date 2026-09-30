/**
 * Circuit — homepage "Open challenges": the newest few open Battles as the
 * same fight cards as the /battles board (ChallengeCard).
 */

import Link from "next/link";
import { ChallengeCard, type ChallengeCardData } from "@/components/ChallengeCard";

export function OpenChallenges({
  battles,
  viewerId,
}: {
  battles: (ChallengeCardData & { creatorId: string })[];
  viewerId?: string | null;
}) {
  if (battles.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight">
          Open challenges <span className="font-mono text-xs font-normal text-muted tabular-nums">{battles.length}</span>
        </h2>
        <Link href="/battles" className="text-xs font-medium text-accent-blue hover:underline">
          View all
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {battles.map((b, i) => (
          <ChallengeCard key={b.id} battle={b} mine={viewerId === b.creatorId} wide={battles.length % 2 === 1 && i === battles.length - 1} />
        ))}
      </div>
    </section>
  );
}
