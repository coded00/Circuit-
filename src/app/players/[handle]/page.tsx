/**
 * Circuit — public player profile (Build Plan P3-10, maps: BRK-8, ACC-6).
 * No login required — guest-visible like everything else (ACC-1). Only
 * displayName/handle/avatar/match history show here; dateOfBirth and
 * payoutMethodRef stay private (edited at /account, never rendered here).
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  const player = await prisma.user.findUnique({ where: { handle } });
  if (!player) notFound();

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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center gap-4">
        {player.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs; next/image's domain allowlist doesn't fit V1 scope
          <img
            src={player.avatarUrl}
            alt=""
            className="h-16 w-16 rounded-full border border-border object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface text-xl font-semibold text-muted">
            {player.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold">{player.displayName}</h1>
          <p className="text-muted">@{player.handle}</p>
        </div>
      </div>

      <div className="card flex gap-8">
        <div>
          <div className="text-xs text-muted">Wins</div>
          <div className="text-lg font-semibold text-brand">{wins}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Losses</div>
          <div className="text-lg font-semibold">{losses}</div>
        </div>
      </div>

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
                <a
                  key={match.id}
                  href={`/matches/${match.id}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 text-sm transition hover:border-border-strong hover:bg-surface-hover"
                >
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
