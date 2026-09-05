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
        <h1 className="text-2xl font-semibold">Open Battles</h1>
        <Link href="/battles/new" className="text-sm font-medium underline">
          Open a Battle
        </Link>
      </div>

      <form className="flex gap-2">
        <input
          type="text"
          name="game"
          defaultValue={game ?? ""}
          placeholder="Filter by game"
          className="flex-1 rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black"
        />
        <button type="submit" className="rounded border border-black/15 px-4 py-2 text-sm dark:border-white/20">
          Filter
        </button>
      </form>

      {battles.length === 0 ? (
        <p className="text-zinc-500">No open Battles right now.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {battles.map((battle) => (
            <Link
              key={battle.id}
              href={`/battles/${battle.id}`}
              className="flex items-center justify-between rounded border border-black/10 p-4 text-sm hover:bg-black/[.02] dark:border-white/15 dark:hover:bg-white/[.04]"
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium">{battle.game}</span>
                <span className="text-zinc-500">
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
