/**
 * Circuit — public player profile (Build Plan P3-10, maps: BRK-8, ACC-6).
 * No login required — guest-visible like everything else (ACC-1). Only
 * displayName/handle/avatar/match history show here; dateOfBirth and
 * payoutMethodRef stay private (edited at /account, never rendered here).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { playerRankInGame } from "@/lib/standings";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  const player = await prisma.user.findUnique({ where: { handle } });
  if (!player) notFound();

  const viewer = await getCurrentUser();

  const matches = await prisma.match.findMany({
    where: {
      status: "COMPLETE",
      OR: [{ playerAId: player.id }, { playerBId: player.id }],
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      playerA: { select: { displayName: true, handle: true } },
      playerB: { select: { displayName: true, handle: true } },
      tournament: { select: { name: true } },
      battle: { select: { game: true } },
    },
  });

  const wins = matches.filter((m) => m.winnerId === player.id).length;
  const losses = matches.filter((m) => m.winnerId && m.winnerId !== player.id).length;
  const played = wins + losses;
  const winRate = played === 0 ? null : Math.round((wins / played) * 100);

  const games = [...new Set(matches.map((m) => m.battle?.game).filter((g): g is string => Boolean(g)))];
  const rankChips = (
    await Promise.all(games.map(async (game) => ({ game, rank: await playerRankInGame(game, player.id) })))
  ).filter((chip) => chip.rank !== null);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center gap-4">
        {player.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs; next/image's domain allowlist doesn't fit V1 scope
          <img
            src={player.avatarUrl}
            alt=""
            className="h-16 w-16 rounded-full border-2 border-brand/40 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-brand/40 bg-surface text-xl font-semibold text-muted">
            {player.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex flex-1 items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{player.displayName}</h1>
            <p className="text-muted">@{player.handle}</p>
          </div>
          {viewer && viewer.id !== player.id && (
            <Link href={`/players/${player.handle}/report`} className="text-xs text-muted hover:text-danger">
              Report
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card">
          <div className="text-xs text-muted">Matches played</div>
          <div className="font-mono text-lg font-semibold tabular-nums">{played}</div>
        </div>
        <div className="card">
          <div className="text-xs text-muted">Win rate</div>
          <div className="font-mono text-lg font-semibold tabular-nums">{winRate === null ? "—" : `${winRate}%`}</div>
        </div>
        <div className="card">
          <div className="text-xs text-muted">Wins</div>
          <div className="font-mono text-lg font-semibold tabular-nums text-brand">{wins}</div>
        </div>
        <div className="card">
          <div className="text-xs text-muted">Losses</div>
          <div className="font-mono text-lg font-semibold tabular-nums">{losses}</div>
        </div>
      </div>

      {rankChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rankChips.map((chip) => (
            <Link
              key={chip.game}
              href={`/ladder?game=${encodeURIComponent(chip.game)}`}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium transition hover:border-border-strong"
            >
              {chip.game} — Rank #{chip.rank}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Match history</h2>
        {matches.length === 0 ? (
          <p className="text-sm text-muted">No completed matches yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {matches.map((match) => {
              const opponent = match.playerAId === player.id ? match.playerB : match.playerA;
              const won = match.winnerId === player.id;
              const voided = !match.winnerId;
              return (
                <a key={match.id} href={`/matches/${match.id}`} className="card-row flex items-center justify-between p-3">
                  <span>
                    {match.tournament?.name ?? `Battle · ${match.battle?.game}`} vs{" "}
                    {opponent.displayName}
                  </span>
                  <span
                    className={
                      voided
                        ? "text-muted"
                        : won
                          ? "font-medium text-brand"
                          : "font-medium text-danger"
                    }
                  >
                    {voided ? "Void" : won ? "Win" : "Loss"}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
