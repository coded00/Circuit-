/**
 * Circuit — per-game ranked ladder (Build Plan P4-5, maps: BTL-5).
 *
 * Tracks completed Battles only, not tournament matches — BTL-5 is
 * explicitly about calling out a rival by rank, which is a Battle
 * concept; a bracket run doesn't produce a comparable win/loss record.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { gameStandings } from "@/lib/standings";
import { GameArtTile } from "@/components/GameArtTile";

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
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Ladders</h1>
        {games.length === 0 ? (
          <p className="card text-center text-muted">No completed Battles yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {games.map((g) => (
              <Link
                key={g.game}
                href={`/ladder?game=${encodeURIComponent(g.game)}`}
                className="card-media card-hover relative block h-32 overflow-hidden"
              >
                <GameArtTile game={g.game} className="h-full w-full" />
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  const ranked = await gameStandings(game);

  const rankColors = ["#eab308", "#9ca3af", "#b45309"]; // gold, silver, bronze

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <Link href="/ladder" className="text-sm font-medium text-brand-blue hover:underline">
          ← All games
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{game} ladder</h1>
      </div>

      {ranked.length === 0 ? (
        <p className="card text-center text-muted">No completed Battles for this game yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>W</th>
                <th>L</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((s, i) => (
                <tr key={s.userId}>
                  <td>
                    {rankColors[i] ? (
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs font-bold text-black"
                        style={{ backgroundColor: rankColors[i] }}
                      >
                        {i + 1}
                      </span>
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-elevated font-mono text-xs font-semibold text-muted">
                        {i + 1}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="font-medium">{s.displayName}</span>{" "}
                    <span className="text-muted">(@{s.handle})</span>
                  </td>
                  <td className="font-mono tabular-nums text-success">{s.wins}</td>
                  <td className="font-mono tabular-nums text-danger">{s.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
