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
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Ladders</h1>
        {games.length === 0 ? (
          <p className="card text-center text-muted">No completed Battles yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {games.map((g) => (
              <Link
                key={g.game}
                href={`/ladder?game=${encodeURIComponent(g.game)}`}
                className="card-row px-4 py-3 font-medium"
              >
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

  const medal = ["🥇", "🥈", "🥉"];

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link href="/ladder" className="w-fit text-xs text-muted hover:text-foreground">
          ← All games
        </Link>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{game} ladder</h1>
      </div>

      {ranked.length === 0 ? (
        <p className="card text-center text-muted">No completed Battles for this game yet.</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="px-4 pt-4 pb-2 font-medium">#</th>
                <th className="px-4 pt-4 pb-2 font-medium">Player</th>
                <th className="px-4 pt-4 pb-2 text-right font-medium">W</th>
                <th className="px-4 pt-4 pb-2 text-right font-medium">L</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((s, i) => (
                <tr key={s.userId} className="border-t border-border">
                  <td className="px-4 py-3">{medal[i] ?? i + 1}</td>
                  <td className="px-4 py-3 font-medium">
                    {s.displayName} <span className="text-muted">(@{s.handle})</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-brand tabular-nums">{s.wins}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted tabular-nums">{s.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
