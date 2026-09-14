/**
 * Circuit — public player profile (Build Plan P3-10, maps: BRK-8, ACC-6).
 * No login required — guest-visible like everything else (ACC-1).
 * `dateOfBirth` and `payoutMethodRef` stay private (edited at /account,
 * never rendered here) — the Wallet & Rewards tab (real balance + real
 * transaction totals) is gated to the profile owner for the same reason.
 *
 * A few things worth noting about what's real here vs. deliberately not
 * invented:
 * - **"Level 24"** is the same flat, explicitly-decided decorative
 *   constant `AccountMenu.tsx` already ships (Circuit has no Level/XP
 *   system) — shown here too since the reference design puts it
 *   front-and-center on the profile, not because it's now real data.
 * - **Achievements are 4 real, derived badges** (First Match, 5 Wins,
 *   Tournament Player, Top 10), computed from actual match/registration/
 *   rank data — not a stored achievements/points system, which doesn't
 *   exist anywhere in this codebase.
 * - **Favorite games are real, self-curated** (`User.favoriteGames`,
 *   edited at /account) — not derived automatically from match history,
 *   matching the reference's manual "Edit Games"/"Add Game" affordance.
 * - **The share link is the real profile URL** (`NEXT_PUBLIC_APP_URL`),
 *   not an invented vanity short domain.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Calendar,
  Flag,
  Gamepad2,
  Lock,
  Pencil,
  PlusCircle,
  Shield,
  Star,
  Swords,
  TrendingUp,
  Trophy,
  Wallet as WalletIcon,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { playerRankInGame } from "@/lib/standings";
import { getWalletActivity } from "@/lib/wallet";
import { GameArtTile } from "@/components/GameArtTile";
import { ShareButton } from "@/components/ShareButton";
import { StatusPill, matchStatusInfo } from "@/components/StatusPill";
import TournamentTabs, { type TournamentTab } from "@/app/tournaments/[id]/TournamentTabs";

const ACTIVE_MATCH_PRIORITY: Record<string, number> = { DISPUTED: 0, NEEDS_RESULT: 1, UPCOMING: 2 };

function formatMatchDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { dateStyle: "medium" });
}

function formatNaira(kobo: number): string {
  return `₦ ${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

function StatTile({
  icon,
  iconClass,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: string;
}) {
  return (
    <div className="widget flex items-center gap-3">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] ${iconClass}`}>{icon}</span>
      <div className="flex flex-col">
        <span className="text-eyebrow">{label}</span>
        <span className="text-stat text-xl">{value}</span>
      </div>
    </div>
  );
}

type Achievement = { key: string; label: string; description: string; unlocked: boolean };

function AchievementBadge({ achievement }: { achievement: Achievement }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-[12px] border ${
          achievement.unlocked ? "border-accent-volt/50 bg-accent-volt-soft text-accent-volt" : "border-border bg-surface-elevated text-muted"
        }`}
      >
        {achievement.unlocked ? <Star size={22} /> : <Lock size={18} />}
      </span>
      <div className="flex flex-col">
        <span className="text-xs font-semibold">{achievement.label}</span>
        <span className="text-[11px] text-muted">{achievement.description}</span>
      </div>
    </div>
  );
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
  const isOwnProfile = viewer?.id === player.id;

  const [activeMatches, activeRegistrations, openBattles, allRegistrations, walletActivity] = await Promise.all([
    isOwnProfile
      ? prisma.match.findMany({
          where: {
            OR: [{ playerAId: player.id }, { playerBId: player.id }],
            status: { in: ["UPCOMING", "NEEDS_RESULT", "DISPUTED"] },
          },
          orderBy: { createdAt: "desc" },
          include: {
            playerA: { select: { displayName: true } },
            playerB: { select: { displayName: true } },
            tournament: { select: { name: true } },
            battle: { select: { game: true } },
          },
        })
      : Promise.resolve([]),
    isOwnProfile
      ? prisma.registration.findMany({
          where: { userId: player.id, status: "CONFIRMED", tournament: { status: { in: ["OPEN", "LIVE"] } } },
          include: { tournament: { select: { id: true, name: true, game: true, status: true } } },
        })
      : Promise.resolve([]),
    isOwnProfile
      ? prisma.battle.findMany({ where: { creatorId: player.id, status: "OPEN" }, select: { id: true, game: true, format: true } })
      : Promise.resolve([]),
    prisma.registration.findMany({
      where: { userId: player.id },
      orderBy: { createdAt: "desc" },
      include: { tournament: { select: { id: true, name: true, game: true, status: true, startAt: true } } },
    }),
    isOwnProfile ? getWalletActivity(player.id) : Promise.resolve(null),
  ]);
  activeMatches.sort((a, b) => ACTIVE_MATCH_PRIORITY[a.status] - ACTIVE_MATCH_PRIORITY[b.status]);

  const matches = await prisma.match.findMany({
    where: { status: "COMPLETE", OR: [{ playerAId: player.id }, { playerBId: player.id }] },
    orderBy: { createdAt: "desc" },
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

  // Per-game breakdown for the Game Stats tab — grouped from the same
  // real completed-match list, not a separate invented aggregation.
  const gameStats = games.map((game) => {
    const gameMatches = matches.filter((m) => m.battle?.game === game);
    const gWins = gameMatches.filter((m) => m.winnerId === player.id).length;
    const gLosses = gameMatches.filter((m) => m.winnerId && m.winnerId !== player.id).length;
    const gPlayed = gWins + gLosses;
    const rank = rankChips.find((c) => c.game === game)?.rank ?? null;
    return { game, wins: gWins, losses: gLosses, played: gPlayed, winRate: gPlayed === 0 ? null : Math.round((gWins / gPlayed) * 100), rank };
  });

  const hasTournamentPlayed = allRegistrations.some((r) => r.status === "CONFIRMED");
  const achievements: Achievement[] = [
    { key: "first-match", label: "First Match", description: "Play your first match", unlocked: played >= 1 },
    { key: "five-wins", label: "5 Wins", description: "Win 5 matches", unlocked: wins >= 5 },
    { key: "tournament-player", label: "Tournament Player", description: "Join a tournament", unlocked: hasTournamentPlayed },
    { key: "top-10", label: "Top 10", description: "Finish in top 10", unlocked: rankChips.some((c) => (c.rank ?? 99) <= 10) },
  ];

  const heroGame = player.favoriteGames[0] ?? games[0] ?? null;
  const profileUrl = `${process.env.NEXT_PUBLIC_APP_URL}/players/${player.handle}`;
  const profileHost = profileUrl.replace(/^https?:\/\//, "");

  const overviewContent = (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile icon={<Gamepad2 size={18} />} iconClass="bg-accent-blue-soft text-accent-blue" label="Matches Played" value={String(played)} />
        <StatTile icon={<Trophy size={18} />} iconClass="bg-gold/15 text-gold" label="Wins" value={String(wins)} />
        <StatTile icon={<TrendingUp size={18} />} iconClass="bg-success/15 text-success" label="Win Rate" value={winRate === null ? "—" : `${winRate}%`} />
        <StatTile icon={<Gamepad2 size={18} />} iconClass="bg-danger/15 text-danger" label="Losses" value={String(losses)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="text-card-title">Favourite Games</h2>
              <p className="text-metadata truncate">
                The games {isOwnProfile ? "you play" : `${player.displayName} plays`} on Circuit.
              </p>
            </div>
            {isOwnProfile && (
              <Link href="/account" className="btn-secondary shrink-0">
                <Pencil size={13} />
                Edit Games
              </Link>
            )}
          </div>
          {player.favoriteGames.length === 0 ? (
            <p className="text-sm text-muted">
              {isOwnProfile ? (
                <>
                  No favourite games yet —{" "}
                  <Link href="/account" className="font-medium text-accent-blue hover:underline">
                    add some
                  </Link>
                  .
                </>
              ) : (
                "No favourite games listed yet."
              )}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {player.favoriteGames.map((game) => (
                <div key={game} className="relative flex h-20 flex-col justify-end overflow-hidden rounded-[10px]">
                  <GameArtTile game={game} fill imgWidth={300} />
                </div>
              ))}
              {isOwnProfile && player.favoriteGames.length < 6 && (
                <Link
                  href="/account"
                  className="flex h-20 flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-border-strong text-muted transition hover:text-foreground"
                >
                  <PlusCircle size={18} />
                  <span className="text-xs font-medium">Add Game</span>
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="card flex flex-col gap-2">
          <h2 className="text-card-title">Player Spotlight</h2>
          <p className="text-metadata">Share {isOwnProfile ? "your" : `${player.displayName}'s`} Circuit profile with the community.</p>
          <div className="flex min-w-0 items-center rounded-[10px] bg-surface-elevated px-3 py-2">
            <span className="min-w-0 truncate font-mono text-xs text-muted">{profileHost}</span>
          </div>
          <ShareButton variant="inline" title={`${player.displayName} on Circuit`} url={profileUrl} />
        </div>
      </div>

      <div className="card flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-card-title flex items-center gap-2">
            <Star size={15} className="text-gold" />
            Achievements
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {achievements.map((a) => (
            <AchievementBadge key={a.key} achievement={a} />
          ))}
        </div>
      </div>

      {isOwnProfile && (activeMatches.length > 0 || activeRegistrations.length > 0 || openBattles.length > 0) && (
        <div className="flex flex-col gap-3">
          <h2 className="text-section-heading">Active</h2>
          <div className="flex flex-col gap-2">
            {activeMatches.map((match) => {
              const opponent = match.playerAId === player.id ? match.playerB : match.playerA;
              const status = matchStatusInfo(match.status);
              return (
                <a key={match.id} href={`/matches/${match.id}`} className="card-row flex items-center gap-3 p-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">
                      {match.tournament?.name ?? `Challenge · ${match.battle?.game}`} vs {opponent.displayName}
                    </span>
                    <span className="text-metadata">Match code: {match.matchCode}</span>
                  </div>
                  <StatusPill tone={status.tone} pulse={status.pulse}>
                    {status.label}
                  </StatusPill>
                </a>
              );
            })}
            {activeRegistrations.map((reg) => (
              <Link key={reg.tournamentId} href={`/tournaments/${reg.tournament.id}`} className="card-row flex items-center gap-3 p-3">
                <Trophy size={18} className="shrink-0 text-muted" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{reg.tournament.name}</span>
                  <span className="text-metadata">You&apos;re registered · {reg.tournament.game}</span>
                </div>
              </Link>
            ))}
            {openBattles.map((battle) => (
              <Link key={battle.id} href={`/battles/${battle.id}`} className="card-row flex items-center gap-3 p-3">
                <Swords size={18} className="shrink-0 text-muted" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">Your open Challenge · {battle.game}</span>
                  <span className="text-metadata">Waiting for an opponent</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-section-heading">Recent Matches</h2>
          {matches.length > 0 && (
            <span className="text-xs font-medium text-muted">{matches.length} total</span>
          )}
        </div>
        {matches.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 py-10 text-center">
            <Gamepad2 size={28} className="text-muted" />
            <p className="text-sm font-semibold">No matches yet</p>
            <p className="text-sm text-muted">Jump into a tournament or challenge to see your match history here.</p>
            <Link href="/compete" className="btn-primary mt-2">
              Find a Competition →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {matches.slice(0, 5).map((match) => {
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
                      {match.tournament?.name ?? `Battle · ${match.battle?.game}`} vs {opponent.displayName}
                    </span>
                    <span className="text-metadata">{formatMatchDate(match.createdAt)}</span>
                  </div>
                  <span className={`badge ${resultBadgeClass} shrink-0`}>{voided ? "Void" : won ? "Win" : "Loss"}</span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const matchHistoryContent =
    matches.length === 0 ? (
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
                  {match.tournament?.name ?? `Battle · ${match.battle?.game}`} vs {opponent.displayName}
                </span>
                <span className="text-metadata">{formatMatchDate(match.createdAt)}</span>
              </div>
              <span className={`badge ${resultBadgeClass} shrink-0`}>{voided ? "Void" : won ? "Win" : "Loss"}</span>
            </a>
          );
        })}
      </div>
    );

  const achievementsContent = (
    <div className="card flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        {achievements.map((a) => (
          <AchievementBadge key={a.key} achievement={a} />
        ))}
      </div>
    </div>
  );

  const gameStatsContent =
    gameStats.length === 0 ? (
      <p className="card text-center text-muted">No per-game stats yet — they show up after your first completed match.</p>
    ) : (
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Game</th>
              <th>Played</th>
              <th>Wins</th>
              <th>Losses</th>
              <th>Win Rate</th>
              <th>Rank</th>
            </tr>
          </thead>
          <tbody>
            {gameStats.map((g) => (
              <tr key={g.game}>
                <td className="font-medium">{g.game}</td>
                <td className="font-mono tabular-nums">{g.played}</td>
                <td className="font-mono tabular-nums text-success">{g.wins}</td>
                <td className="font-mono tabular-nums text-danger">{g.losses}</td>
                <td className="font-mono tabular-nums">{g.winRate === null ? "—" : `${g.winRate}%`}</td>
                <td>{g.rank == null ? "—" : <span className="badge badge-brand">#{g.rank}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const tournamentsContent =
    allRegistrations.length === 0 ? (
      <p className="card text-center text-muted">No tournament registrations yet.</p>
    ) : (
      <div className="flex flex-col gap-2">
        {allRegistrations.map((reg) => (
          <Link key={reg.id} href={`/tournaments/${reg.tournament.id}`} className="card-row flex items-center gap-3 p-3">
            <Trophy size={18} className="shrink-0 text-muted" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium">{reg.tournament.name}</span>
              <span className="text-metadata">
                {reg.tournament.game} · {reg.tournament.startAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
              </span>
            </div>
            <span className="badge badge-neutral shrink-0">{reg.status}</span>
          </Link>
        ))}
      </div>
    );

  const tabs: TournamentTab[] = [
    { key: "overview", label: "Overview", content: overviewContent },
    { key: "matches", label: "Match History", content: matchHistoryContent },
    { key: "achievements", label: "Achievements", content: achievementsContent },
    { key: "stats", label: "Game Stats", content: gameStatsContent },
    { key: "tournaments", label: "Tournaments", content: tournamentsContent },
  ];

  if (isOwnProfile && walletActivity) {
    tabs.push({
      key: "wallet",
      label: "Wallet & Rewards",
      content: (
        <div className="flex flex-col gap-4">
          <div data-surface="dark" className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-eyebrow text-muted">Available balance</span>
              <span className="font-display text-3xl font-bold tracking-tight">{formatNaira(walletActivity.balance)}</span>
            </div>
            <Link href="/wallet" className="btn-primary shrink-0">
              <WalletIcon size={14} />
              Open Wallet
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="widget flex flex-col gap-1">
              <span className="text-eyebrow">Entry fees paid</span>
              <span className="text-stat text-xl">{formatNaira(walletActivity.totalPaid)}</span>
            </div>
            <div className="widget flex flex-col gap-1">
              <span className="text-eyebrow">Refunded</span>
              <span className="text-stat text-xl">{formatNaira(walletActivity.totalRefunded)}</span>
            </div>
            <div className="widget flex flex-col gap-1">
              <span className="text-eyebrow">Prizes won</span>
              <span className="text-stat text-xl text-gold">{formatNaira(walletActivity.totalWon)}</span>
            </div>
          </div>
          <p className="card text-center text-sm text-muted">
            Rewards (points, perks) aren&apos;t built yet — this tab is your real Circuit balance and transaction totals only.
          </p>
        </div>
      ),
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <div data-surface="dark" className="relative overflow-hidden rounded-[20px] border border-border p-4 sm:p-5">
        {heroGame && <GameArtTile game={heroGame} className="opacity-[0.18]" fill hideLabel imgWidth={1400} />}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundImage: "linear-gradient(100deg, var(--surface) 45%, transparent)" }}
        />
        {/* Avatar + details on the left, action button on the right —
            one row once there's enough width; stacked on narrow phones
            so the button doesn't crowd the bio/date text. */}
        <div className="relative z-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 text-left">
            <div className="relative shrink-0">
              {player.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
                <img
                  src={player.avatarUrl}
                  alt=""
                  className="h-16 w-16 rounded-full border-2 border-border-strong object-cover sm:h-20 sm:w-20"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-border-strong bg-surface-elevated text-2xl font-semibold text-muted sm:h-20 sm:w-20">
                  {player.displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              {isOwnProfile && (
                <Link
                  href="/account"
                  aria-label="Edit avatar"
                  className="btn-icon absolute right-0 bottom-0 h-6 w-6 border border-border bg-surface"
                >
                  <Pencil size={11} />
                </Link>
              )}
            </div>
            <div className="flex min-w-0 flex-col items-start gap-1">
              <span className="badge border border-gold/40 bg-gold/10 text-gold">
                <Shield size={11} />
                Level 24
              </span>
              <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{player.displayName}</h1>
              <p className="text-metadata">@{player.handle}</p>
              <p className="max-w-sm text-sm text-muted">
                {player.bio ||
                  (isOwnProfile ? (
                    <Link href="/account" className="hover:underline">
                      Add a short bio →
                    </Link>
                  ) : null)}
              </p>
              <span className="flex items-center gap-1 text-xs text-muted">
                <Calendar size={11} />
                Member since {player.createdAt.toLocaleDateString("en-NG", { month: "long", year: "numeric" })}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            {isOwnProfile ? (
              <Link href="/account" className="btn-secondary">
                <Pencil size={13} />
                Edit Profile
              </Link>
            ) : (
              viewer && (
                <Link href={`/players/${player.handle}/report`} className="btn-secondary">
                  <Flag size={13} />
                  Report
                </Link>
              )
            )}
          </div>
        </div>
      </div>

      <TournamentTabs tabs={tabs} />
    </div>
  );
}
