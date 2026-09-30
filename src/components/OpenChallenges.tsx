/**
 * Circuit — homepage "Open challenges": the newest few open Battles as the
 * same opponent cards as the /battles board (ChallengeCard).
 */

import Link from "next/link";
import { ChallengeCard, type ChallengeCardData } from "@/components/ChallengeCard";
import { recordKey } from "@/lib/challengeView";

export function OpenChallenges({
  battles,
  records,
  total,
  viewerId,
}: {
  battles: (ChallengeCardData & { creatorId: string })[];
  /** Win-loss records keyed by recordKey(game, userId). */
  records: Map<string, { wins: number; losses: number }>;
  /** How many open challenges there are in all, so "View all" can say how many more wait there. */
  total: number;
  viewerId?: string | null;
}) {
  if (battles.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight">
          Open challenges <span className="font-mono text-xs font-normal text-muted tabular-nums">{total}</span>
        </h2>
        <Link href="/battles" className="text-xs font-medium text-accent-blue hover:underline">
          View all{total > battles.length ? ` (${total})` : ""}
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {battles.map((b) => (
          <ChallengeCard key={b.id} battle={b} record={records.get(recordKey(b.game, b.creatorId)) ?? null} mine={viewerId === b.creatorId} />
        ))}
      </div>
    </section>
  );
}
