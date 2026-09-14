/**
 * Circuit — open Challenge board (Build Plan P4-2, maps: BTL-2). User-
 * facing "Challenges" is the existing free `Battle` feature under its
 * MVP-rework name — same model/route/logic, copy-only rename.
 *
 * Only OPEN-visibility, still-OPEN-status Battles show here — a targeted
 * challenge is invisible to everyone but its target (delivered via
 * notification, BTL-3), not a variant of this board. Every Battle here is
 * still waiting for an opponent, so every card is the same `ChallengeCard`
 * the homepage's Open Challenges carousel renders — see that component's
 * own header comment for what's real vs. deliberately not invented (no
 * prize pool, no rating number, no countdown).
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import Poller from "@/app/Poller";
import { ChallengeCard } from "@/components/ChallengeCard";

export default async function BattleBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;

  const battles = await prisma.battle.findMany({
    where: {
      status: "OPEN",
      visibility: "OPEN",
      ...(game ? { game: { equals: game, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { creator: { select: { displayName: true, avatarUrl: true } } },
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8 sm:px-8">
      <Poller />
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Open Challenges</h1>
        <Link href="/battles/new" className="btn-primary">
          Open a Challenge
        </Link>
      </div>

      <form className="flex items-center gap-2">
        <input
          type="text"
          name="game"
          defaultValue={game ?? ""}
          placeholder="Filter by game"
          className="field-input max-w-xs"
        />
        <button type="submit" className="btn-secondary">
          Filter
        </button>
      </form>

      {battles.length === 0 ? (
        <p className="card text-center text-muted">No open Challenges right now.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {battles.map((battle) => (
            <ChallengeCard key={battle.id} battle={battle} />
          ))}
        </div>
      )}
    </div>
  );
}
