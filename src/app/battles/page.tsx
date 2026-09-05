/**
 * Circuit — open Battle board (Build Plan P4-2, maps: BTL-2).
 *
 * Only OPEN-visibility, still-OPEN-status Battles show here — a targeted
 * challenge is invisible to everyone but its target (delivered via
 * notification, BTL-3), not a variant of this board.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import Poller from "@/app/Poller";
import { StatusPill } from "@/components/StatusPill";

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
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <Poller />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Open Battles</h1>
        <Link href="/battles/new" className="btn-primary">
          Open a Battle
        </Link>
      </div>

      <form className="flex gap-2">
        <input
          type="text"
          name="game"
          defaultValue={game ?? ""}
          placeholder="Filter by game"
          className="field-input flex-1"
        />
        <button type="submit" className="btn-secondary">
          Filter
        </button>
      </form>

      {battles.length === 0 ? (
        <p className="card text-center text-muted">No open Battles right now.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {battles.map((battle) => (
            <Link key={battle.id} href={`/battles/${battle.id}`} className="card-row flex items-center justify-between p-4">
              <div className="flex flex-col gap-1">
                <span className="font-medium">{battle.game}</span>
                <span className="text-muted">
                  {battle.format === "BEST_OF_3" ? "Best of 3" : "Single match"} · opened by{" "}
                  {battle.creator.displayName} (@{battle.creator.handle})
                </span>
              </div>
              <StatusPill tone="live" pulse>
                Open
              </StatusPill>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
