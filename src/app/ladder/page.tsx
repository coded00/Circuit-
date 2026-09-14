/**
 * Circuit — Leaderboard (Build Plan P4-5, maps: BTL-5). Tracks completed
 * Battles only, not tournament matches — BTL-5 is explicitly about calling
 * out a rival by rank, which is a Battle concept; a bracket run doesn't
 * produce a comparable win/loss record.
 *
 * Consolidated from the old two-step "pick a game, then see its ladder"
 * flow into one page: Global standings (every completed Battle, any game)
 * by default, narrowed with the game filter — the same data either way,
 * `globalStandings()`/`gameStandings()` just called with or without a
 * game name.
 *
 * A supplied reference design showed several things this page has no real
 * data for, deliberately not built:
 * - **No season countdown.** There's no season/event model anywhere in
 *   the schema — a countdown to a date that doesn't exist and has no
 *   real consequence would be actively misleading, not decorative.
 * - **No "Points"/gems/gift-box currency.** Wallet/Marketplace/Rewards
 *   are still `ComingSoon` placeholders (see those pages' own comments) —
 *   there is no virtual economy yet for a leaderboard to display.
 * - **No "Level" chips or "verified" checkmarks.** No Level/XP system and
 *   no player-verification concept exist. `AccountMenu.tsx` already ships
 *   one narrow, explicitly-decided decorative "Level 24"; this page
 *   doesn't extend that exception to every row of a real leaderboard.
 * - **No "Best Win (mins)".** `Match` has no completion timestamp
 *   distinct from `createdAt`, so a real match duration isn't derivable.
 * What *is* real and shown: total registered players and completed
 * matches (both with genuine month-over-month change), and Wins/Losses/
 * Win Rate per player — the same `gameStandings`/`globalStandings`
 * aggregation the ladder, homepage, and public profile pages all share.
 */

import Link from "next/link";
import { ArrowDown, ArrowUp, Crown, Gamepad2, Swords, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { gameStandings, globalStandings, type Standing } from "@/lib/standings";
import { getFriendIds } from "@/lib/friends";
import { GameArtTile } from "@/components/GameArtTile";
import { CountUp } from "@/components/CountUp";

const RANK_COLORS = ["#eab308", "#9ca3af", "#b45309"]; // gold, silver, bronze — same as homepage leaderboard

function Avatar({ avatarUrl, name, size, ringClass }: { avatarUrl: string | null; name: string; size: number; ringClass: string }) {
  const px = `${size}px`;
  return avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
    <img src={avatarUrl} alt="" style={{ height: px, width: px }} className={`rounded-full border-2 object-cover ${ringClass}`} />
  ) : (
    <div
      style={{ height: px, width: px }}
      className={`flex items-center justify-center rounded-full border-2 bg-surface-elevated text-lg font-semibold text-muted ${ringClass}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const positive = pct >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-semibold ${positive ? "text-success" : "text-danger"}`}>
      {positive ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      {Math.abs(pct)}%
    </span>
  );
}

function StatTile({
  icon,
  label,
  value,
  changePct,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  changePct: number | null;
}) {
  return (
    <div className="widget flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-surface-elevated text-accent-blue">
        {icon}
      </span>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          {/* Not CountUp here — these can run into the thousands and
              CountUp's rAF write doesn't preserve toLocaleString's comma
              grouping, which would regress the real number's readability. */}
          <span className="text-stat text-2xl motion-fade-in">{value.toLocaleString()}</span>
          <ChangeBadge pct={changePct} />
        </div>
        <span className="text-metadata">{label} · vs start of month</span>
      </div>
    </div>
  );
}

function PodiumStat({ label, value, animate }: { label: string; value: string | number; animate?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-sm font-bold text-foreground">
        {animate && typeof value === "number" ? <CountUp value={value} /> : value}
      </span>
      <span className="text-[10px] tracking-wide text-muted uppercase">{label}</span>
    </div>
  );
}

function PodiumCard({ standing, rank, order }: { standing: Standing; rank: number; order: number }) {
  const played = standing.wins + standing.losses;
  const winRate = played === 0 ? 0 : Math.round((standing.wins / played) * 100);
  const color = RANK_COLORS[rank - 1];
  return (
    <Link
      href={`/players/${standing.handle}`}
      // motion-fade-in (opacity-only), not celebrate-fade — celebrate-fade
      // also animates transform, and with fill-mode "both" that would
      // permanently override rank 1's static sm:-translate-y-2 elevation
      // once the entrance finished (CSS Animations outrank normal rules
      // on the cascade for the same property).
      className={`card card-hover motion-fade-in motion-stagger flex flex-col items-center gap-3 p-5 text-center ${rank === 1 ? "sm:-translate-y-2" : ""}`}
      style={{
        "--i": order,
        ...(rank === 1 ? { borderColor: `${color}66`, background: `${color}0d` } : {}),
      } as React.CSSProperties}
    >
      <div className="flex items-center gap-1.5">
        {rank === 1 && <Crown size={16} aria-hidden className="trophy-pop" style={{ color }} />}
        <span className="font-display text-2xl font-bold" style={{ color }}>
          #{rank}
        </span>
      </div>
      <Avatar avatarUrl={standing.avatarUrl} name={standing.displayName} size={68} ringClass="" />
      <div className="flex flex-col gap-0.5">
        <span className="font-display text-lg font-bold tracking-tight">{standing.displayName}</span>
        <span className="text-xs text-muted">@{standing.handle}</span>
      </div>
      <div className="flex w-full items-center justify-center gap-5 border-t border-border pt-3">
        <PodiumStat label="Wins" value={standing.wins} animate />
        <PodiumStat label="Matches" value={String(played)} />
        <PodiumStat label="Win Rate" value={`${winRate}%`} />
      </div>
    </Link>
  );
}

async function distinctParticipants(before?: Date): Promise<number> {
  const rows = await prisma.match.findMany({
    where: {
      status: "COMPLETE",
      battle: { status: "COMPLETE" },
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    select: { playerAId: true, playerBId: true },
  });
  return new Set(rows.flatMap((m) => [m.playerAId, m.playerBId])).size;
}

function pctChange(now: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

export default async function LadderPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; scope?: string }>;
}) {
  const { game, scope } = await searchParams;
  const isMonth = scope === "month";
  const isFriends = scope === "friends";
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const since = isMonth ? startOfThisMonth : undefined;

  const [user, games, allStandings, totalUsersNow, totalUsersLastMonth, matchesNow, matchesLastMonth, participatedNow, participatedLastMonth] =
    await Promise.all([
      getCurrentUser(),
      prisma.battle.findMany({ where: { status: "COMPLETE" }, select: { game: true }, distinct: ["game"], orderBy: { game: "asc" } }),
      game ? gameStandings(game, since) : globalStandings(since),
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { lt: startOfThisMonth } } }),
      prisma.match.count({ where: { status: "COMPLETE", battle: { status: "COMPLETE" } } }),
      prisma.match.count({ where: { status: "COMPLETE", battle: { status: "COMPLETE" }, createdAt: { lt: startOfThisMonth } } }),
      distinctParticipants(),
      distinctParticipants(startOfThisMonth),
    ]);

  const friendScopeActive = isFriends && !!user;
  const friendIds = friendScopeActive ? new Set([user!.id, ...(await getFriendIds(user!.id))]) : null;
  const standings = friendIds ? allStandings.filter((s) => friendIds.has(s.userId)) : allStandings;

  const podium = standings.slice(0, 3);
  const rest = standings.slice(3);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8 sm:px-8 sm:py-10">
      <div data-surface="dark" className="relative overflow-hidden rounded-[20px] border border-border bg-surface p-8 sm:p-10">
        {games[0] && <GameArtTile game={games[0].game} className="opacity-[0.14]" fill hideLabel imgWidth={1200} />}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundImage: "linear-gradient(100deg, var(--surface) 35%, transparent)" }}
        />
        <div className="relative z-10 flex flex-col gap-2">
          <h1 className="font-display text-4xl leading-none font-bold tracking-tight uppercase sm:text-5xl">Leaderboard</h1>
          <p className="text-sm text-muted">Ranked by real wins, across every Challenge played on Circuit.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile icon={<Users size={18} />} label="Total registered" value={totalUsersNow} changePct={pctChange(totalUsersNow, totalUsersLastMonth)} />
        <StatTile
          icon={<Gamepad2 size={18} />}
          label="Total participated"
          value={participatedNow}
          changePct={pctChange(participatedNow, participatedLastMonth)}
        />
        <StatTile icon={<Swords size={18} />} label="Matches played" value={matchesNow} changePct={pctChange(matchesNow, matchesLastMonth)} />
      </div>

      {podium.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
          {podium[1] && <PodiumCard standing={podium[1]} rank={2} order={0} />}
          {podium[0] && <PodiumCard standing={podium[0]} rank={1} order={1} />}
          {podium[2] && <PodiumCard standing={podium[2]} rank={3} order={2} />}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="tabs">
          <Link
            href={`/ladder${game ? `?game=${encodeURIComponent(game)}` : ""}`}
            className={`tab ${!isMonth && !isFriends ? "tab-active" : ""}`}
          >
            Global
          </Link>
          <Link
            href={`/ladder?scope=month${game ? `&game=${encodeURIComponent(game)}` : ""}`}
            className={`tab ${isMonth ? "tab-active" : ""}`}
          >
            This Month
          </Link>
          {user ? (
            <Link
              href={`/ladder?scope=friends${game ? `&game=${encodeURIComponent(game)}` : ""}`}
              className={`tab ${friendScopeActive ? "tab-active" : ""}`}
            >
              Friends
            </Link>
          ) : (
            <span className="tab tab-disabled" title="Log in to see your friends' ranking">
              Friends
            </span>
          )}
        </div>

        <form method="get" className="flex items-center gap-2">
          {isMonth && <input type="hidden" name="scope" value="month" />}
          <select name="game" defaultValue={game ?? ""} className="field-select w-40">
            <option value="">All Games</option>
            {games.map((g) => (
              <option key={g.game} value={g.game}>
                {g.game}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </form>
      </div>

      {rest.length === 0 && podium.length === 0 ? (
        <p className="card motion-fade-in text-center text-muted">
          {friendScopeActive
            ? "None of your friends have a completed Challenge yet."
            : `No completed Challenges yet${game ? ` for ${game}` : ""}.`}
        </p>
      ) : rest.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Wins</th>
                <th>Losses</th>
                <th>Matches</th>
                <th>Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((s, i) => {
                const played = s.wins + s.losses;
                const winRate = played === 0 ? 0 : Math.round((s.wins / played) * 100);
                // Capped so a long leaderboard doesn't leave rows past the
                // fold invisible for seconds waiting on their delay — real
                // rows shouldn't be hidden by decoration.
                const staggerIndex = Math.min(i, 12);
                return (
                  <tr key={s.userId} style={{ "--i": staggerIndex } as React.CSSProperties} className="rank-row">
                    <td className="font-mono text-muted">{i + 4}</td>
                    <td>
                      <Link href={`/players/${s.handle}`} className="flex items-center gap-2.5 hover:underline">
                        <Avatar avatarUrl={s.avatarUrl} name={s.displayName} size={28} ringClass="border-border" />
                        <span className="font-medium">{s.displayName}</span>
                        <span className="text-muted">@{s.handle}</span>
                      </Link>
                    </td>
                    <td className="font-mono tabular-nums text-success">
                      <CountUp value={s.wins} />
                    </td>
                    <td className="font-mono tabular-nums text-danger">{s.losses}</td>
                    <td className="font-mono tabular-nums">{played}</td>
                    <td className="font-mono tabular-nums">{winRate}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
