/**
 * Circuit — open Challenge board (Build Plan P4-2, maps: BTL-2). User-
 * facing "Challenges" is the existing free `Battle` feature under its
 * MVP-rework name — same model/route/logic, copy-only rename.
 *
 * Only OPEN-visibility, still-OPEN-status Battles show here — a targeted
 * challenge is invisible to everyone but its target (delivered via
 * notification, BTL-3), not a variant of this board.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import Poller from "@/app/Poller";
import { StatusPill } from "@/components/StatusPill";
import { GameArtTile } from "@/components/GameArtTile";

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
    include: { creator: { select: { displayName: true, handle: true } } },
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
            <Link key={battle.id} href={`/battles/${battle.id}`} className="card-media card-hover flex flex-col">
              <div className="relative h-28 w-full overflow-hidden">
                <GameArtTile game={battle.game} className="h-full w-full">
                  <span className="absolute top-2 left-2 z-10">
                    <StatusPill tone="live" pulse>
                      Open
                    </StatusPill>
                  </span>
                </GameArtTile>
              </div>
              <div className="flex flex-col gap-1 p-3">
                <span className="text-card-title font-semibold">{battle.game}</span>
                <span className="truncate text-xs text-muted">
                  {battle.format === "BEST_OF_3" ? "Best of 3" : "Single match"} · opened by{" "}
                  {battle.creator.displayName} (@{battle.creator.handle})
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
