/**
 * Circuit — homepage "Open challenges": the newest few open Battles as the
 * same opponent cards as the /battles board (ChallengeCard).
 */

import Link from "next/link";
import { ChallengeCard, type ChallengeCardData } from "@/components/ChallengeCard";
import { recordKey } from "@/lib/challengeView";
import { DailyChallengeCard, type DailyChallengeCardData } from "@/components/DailyChallengeCard";

export function OpenChallenges({
  battles,
  records,
  total,
  viewerId,
  daily = [],
  dailyTotal = 0,
}: {
  battles: (ChallengeCardData & { creatorId: string })[];
  /** Win-loss records keyed by recordKey(game, userId). */
  records: Map<string, { wins: number; losses: number }>;
  /** How many open challenges there are in all, so "View all" can say how many more wait there. */
  total: number;
  viewerId?: string | null;
  /** Daily Challenges shown in the same row, first: there are fewer of them and each is a bigger prize. */
  daily?: DailyChallengeCardData[];
  /** How many Daily Challenges are open in all. */
  dailyTotal?: number;
}) {
  if (battles.length === 0 && daily.length === 0) return null;
  const now = new Date();
  const grand = total + dailyTotal;
  const shown = daily.length + battles.length;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight">
          Open challenges <span className="font-mono text-xs font-normal text-muted tabular-nums">{grand}</span>
        </h2>
        <Link href="/battles" className="-my-2.5 py-2.5 pl-3 text-xs font-medium text-accent-blue hover:underline">
          View all{grand > shown ? ` (${grand})` : ""}
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {daily.map((c) => (
          <DailyChallengeCard key={c.id} c={c} now={now} />
        ))}
        {battles.map((b) => (
          <ChallengeCard key={b.id} battle={b} record={records.get(recordKey(b.game, b.creatorId)) ?? null} mine={viewerId === b.creatorId} />
        ))}
      </div>
    </section>
  );
}
