/**
 * Circuit — per-game ranked ladder (Build Plan P4-5, maps: BTL-5).
 *
 * Tracks completed Battles only, not tournament matches — BTL-5 is
 * explicitly about calling out a rival by rank, which is a Battle
 * concept; a bracket run doesn't produce a comparable win/loss record.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";

type Standing = { userId: string; displayName: string; handle: string; wins: number; losses: number };

export default async function LadderPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;

  const games = await prisma.battle.findMany({
    where: { status: "COMPLETE" },
    select: { game: true },
    distinct: ["game"],
    orderBy: { game: "asc" },
  });

  if (!game) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-16">
        <h1 className="text-2xl font-semibold">Ladders</h1>
        {games.length === 0 ? (
          <p className="text-zinc-500">No completed Battles yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {games.map((g) => (
              <Link key={g.game} href={`/ladder?game=${encodeURIComponent(g.game)}`} className="underline">
                {g.game}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  const matches = await prisma.match.findMany({
    where: { status: "COMPLETE", battle: { game, status: "COMPLETE" } },
    select: {
      winnerId: true,
      playerAId: true,
      playerBId: true,
      playerA: { select: { displayName: true, handle: true } },
      playerB: { select: { displayName: true, handle: true } },
    },
  });

  const standings = new Map<string, Standing>();
  function ensure(userId: string, displayName: string, handle: string): Standing {
    let s = standings.get(userId);
    if (!s) {
      s = { userId, displayName, handle, wins: 0, losses: 0 };
      standings.set(userId, s);
    }
    return s;
  }

  for (const match of matches) {
    if (!match.winnerId) continue; // shouldn't happen for COMPLETE, defensive
    const a = ensure(match.playerAId, match.playerA.displayName, match.playerA.handle);
    const b = ensure(match.playerBId, match.playerB.displayName, match.playerB.handle);
    if (match.winnerId === match.playerAId) {
      a.wins++;
      b.losses++;
    } else {
      b.wins++;
      a.losses++;
    }
  }

  const ranked = [...standings.values()].sort((x, y) => y.wins - x.wins || x.losses - y.losses);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link href="/ladder" className="w-fit text-xs text-zinc-500 underline">
          All games
        </Link>
        <h1 className="text-2xl font-semibold">{game} ladder</h1>
      </div>

      {ranked.length === 0 ? (
        <p className="text-zinc-500">No completed Battles for this game yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-500">
              <th className="pb-2">#</th>
              <th className="pb-2">Player</th>
              <th className="pb-2 text-right">W</th>
              <th className="pb-2 text-right">L</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((s, i) => (
              <tr key={s.userId} className="border-t border-black/10 dark:border-white/15">
                <td className="py-2">{i + 1}</td>
                <td className="py-2">
                  {s.displayName} (@{s.handle})
                </td>
                <td className="py-2 text-right">{s.wins}</td>
                <td className="py-2 text-right">{s.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
