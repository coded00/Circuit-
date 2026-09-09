/**
 * Circuit — public player profile (Build Plan P3-10, maps: BRK-8, ACC-6).
 * No login required — guest-visible like everything else (ACC-1). Only
 * displayName/handle/avatar/match history show here; dateOfBirth and
 * payoutMethodRef stay private (edited at /account, never rendered here).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { Flag, Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { playerRankInGame } from "@/lib/standings";
import { GameArtTile } from "@/components/GameArtTile";

function formatMatchDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { dateStyle: "medium" });
}

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
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-6 sm:p-8">
      <div className="card flex flex-col gap-4 sm:flex-row sm:items-center">
        {player.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs; next/image's domain allowlist doesn't fit V1 scope
          <img
            src={player.avatarUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full border border-border object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated text-xl font-semibold text-muted">
            {player.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-section-heading text-xl">{player.displayName}</h1>
            <p className="text-metadata">@{player.handle}</p>
          </div>
          {viewer && viewer.id !== player.id && (
            <Link href={`/players/${player.handle}/report`} className="btn-secondary self-start sm:self-auto">
              <Flag size={14} />
              Report
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Matches played</span>
          <span className="text-stat text-2xl">{played}</span>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Win rate</span>
          <span className="text-stat text-2xl">{winRate === null ? "—" : `${winRate}%`}</span>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Wins</span>
          <span className="text-stat text-2xl">{wins}</span>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Losses</span>
          <span className="text-stat text-2xl">{losses}</span>
        </div>
      </div>

      {rankChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rankChips.map((chip) => (
            <Link key={chip.game} href={`/ladder?game=${encodeURIComponent(chip.game)}`} className="badge badge-brand hover:brightness-110">
              {chip.game} — Rank #{chip.rank}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-section-heading">Match history</h2>
        {matches.length === 0 ? (
          <p className="card text-center text-muted">No completed matches yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {matches.map((match) => {
              const opponent = match.playerAId === player.id ? match.playerB : match.playerA;
              const won = match.winnerId === player.id;
              const voided = !match.winnerId;
              const resultBadgeClass = voided ? "badge-neutral" : won ? "badge-complete" : "badge-cancelled";
              return (
                <a key={match.id} href={`/matches/${match.id}`} className="card-row flex items-center gap-3 p-3">
                  {match.battle?.game ? (
                    <GameArtTile game={match.battle.game} className="h-12 w-12 shrink-0 rounded-[8px]" hideLabel />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] border border-border bg-surface-elevated text-muted">
                      <Trophy size={18} />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">
                      {match.tournament?.name ?? `Battle · ${match.battle?.game}`} vs{" "}
                      {opponent.displayName}
                    </span>
                    <span className="text-metadata">{formatMatchDate(match.createdAt)}</span>
                  </div>
                  <span className={`badge ${resultBadgeClass} shrink-0`}>
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
