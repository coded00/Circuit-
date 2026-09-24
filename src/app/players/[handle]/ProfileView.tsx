/**
 * Circuit — player profile presentation. Pure rendering from `ProfileData`
 * (page.tsx does every query and derivation), so the whole experience
 * reads top to bottom in one place:
 *
 *   Identity header  — who this is, and their record at a glance (the
 *                       four numbers a competitor actually checks).
 *   Tabs             — Overview (always the default) · Matches ·
 *                       Tournaments · Friends · Teams · Wallet (owner only).
 *   Overview         — what needs your attention, recent form + battles,
 *                       per-game performance; a side rail with
 *                       achievements, favourite games, friends and teams.
 *
 * Built only from existing design-system pieces (card, tabs, badge,
 * StatusPill, GameArtTile, text-stat/text-eyebrow) and only from real
 * data — no decorative levels, invented numbers or filler cards.
 */

import Link from "next/link";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Flag,
  Gamepad2,
  Lock,
  MapPin,
  Pencil,
  Swords,
  Trophy,
  Users,
  Wallet as WalletIcon,
} from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { ShareButton } from "@/components/ShareButton";
import { StatusPill, registrationStatusInfo, type StatusTone } from "@/components/StatusPill";
import { FriendButton, type FriendButtonStatus } from "@/components/FriendButton";
import { FriendRequestRow } from "@/components/friends/FriendRequestRow";
import { AddFriendForm } from "@/components/friends/AddFriendForm";
import { TeamInviteRow } from "@/components/teams/TeamInviteRow";
import { TeamRequestRow } from "@/components/teams/TeamRequestRow";
import { CreateTeamForm } from "@/components/teams/CreateTeamForm";
import { Panel, PanelEmpty } from "@/components/ui/Panel";
import { StatStrip, type Stat } from "@/components/ui/StatStrip";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SectionTabs, SectionTabLink, type SectionTab } from "@/components/ui/SectionTabs";

// ---------------------------------------------------------------------------
// Data shape
// ---------------------------------------------------------------------------

export type Result = "W" | "L" | "VOID";
export type Person = { handle: string; displayName: string; avatarUrl: string | null };

export type MatchSummary = {
  id: string;
  opponent: { displayName: string; handle: string };
  /** Tournament name, or "Challenge" for a Battle match. */
  context: string;
  game: string | null;
  date: Date;
  result: Result;
};

export type AttentionItem = {
  id: string;
  href: string;
  kind: "match" | "registration" | "battle";
  title: string;
  subtitle: string;
  status?: { tone: StatusTone; label: string; pulse?: boolean };
};

export type ProfileData = {
  player: {
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    region: string | null;
    favoriteGames: string[];
    createdAt: Date;
  };
  isOwnProfile: boolean;
  viewerSignedIn: boolean;
  friendStatus: FriendButtonStatus | null;
  profileUrl: string;
  stats: {
    wins: number;
    losses: number;
    played: number;
    winRate: number | null;
    streak: { result: "W" | "L"; count: number } | null;
    tournaments: number;
    bestRank: { rank: number; game: string } | null;
  };
  /** Latest first, voids excluded, at most 10. */
  form: ("W" | "L")[];
  /** Completed matches, latest first. */
  matches: MatchSummary[];
  gameStats: { game: string; wins: number; losses: number; played: number; winRate: number | null; rank: number | null }[];
  achievements: {
    key: string;
    label: string;
    description: string;
    unlocked: boolean;
    progress: { current: number; target: number } | null;
  }[];
  attention: AttentionItem[];
  registrations: {
    id: string;
    tournamentId: string;
    name: string;
    game: string;
    startAt: Date;
    status: string;
  }[];
  friends: {
    accepted: (Person & { friendshipId: string })[];
    incoming: (Person & { friendshipId: string })[];
    outgoing: (Person & { friendshipId: string })[];
  };
  teams: {
    mine: { id: string; name: string; tag: string | null; game: string | null; isCaptain: boolean }[];
    invites: { id: string; teamId: string; name: string; tag: string | null }[];
    requests: { id: string; teamId: string; name: string; tag: string | null }[];
  };
  wallet: { balance: number; totalPaid: number; totalRefunded: number; totalWon: number } | null;
  initialTab?: string;
};

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function ViewAll({ tab, label = "View all" }: { tab: string; label?: string }) {
  return (
    <SectionTabLink
      tab={tab}
      className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-accent-blue transition hover:gap-1"
    >
      {label}
      <ChevronRight size={13} />
    </SectionTabLink>
  );
}

const RESULT_STYLE: Record<Result, { bar: string; text: string; label: string }> = {
  W: { bar: "bg-success", text: "text-success", label: "Win" },
  L: { bar: "bg-danger", text: "text-danger", label: "Loss" },
  VOID: { bar: "bg-border-strong", text: "text-muted", label: "Void" },
};

function MatchRow({ match }: { match: MatchSummary }) {
  const style = RESULT_STYLE[match.result];
  return (
    <Link
      href={`/matches/${match.id}`}
      className="group flex items-center gap-3 px-5 py-3 transition-colors duration-[var(--duration-fast)] hover:bg-surface-elevated/60"
    >
      <span aria-hidden className={`h-9 w-1 shrink-0 rounded-full ${style.bar}`} />
      {match.game ? (
        <GameArtTile game={match.game} className="h-10 w-10 shrink-0 rounded-[8px]" hideLabel imgWidth={120} />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-surface-elevated text-muted">
          <Trophy size={16} />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">vs {match.opponent.displayName}</span>
        <span className="text-metadata truncate">
          {match.context}
          {match.game && match.context !== match.game ? ` · ${match.game}` : ""} · {formatDate(match.date)}
        </span>
      </div>
      <span className={`font-mono text-xs font-semibold tracking-wider uppercase ${style.text}`}>{style.label}</span>
      <ChevronRight size={14} className="shrink-0 text-muted opacity-0 transition group-hover:opacity-100" />
    </Link>
  );
}

function FormStrip({ form }: { form: ("W" | "L")[] }) {
  if (form.length === 0) return null;
  return (
    <div className="flex items-center gap-1" aria-label={`Last ${form.length} results, most recent first: ${form.join(" ")}`}>
      {form.map((r, i) => (
        <span
          key={i}
          aria-hidden
          className={`flex h-5 w-5 items-center justify-center rounded-[5px] font-mono text-[10px] font-bold ${
            r === "W" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
          } ${i === 0 ? "ring-1 ring-current/40" : ""}`}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

function WinRateBar({ value }: { value: number | null }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated" aria-hidden>
      <div className="h-full rounded-full bg-accent-blue" style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}

function GameRows({ games }: { games: ProfileData["gameStats"] }) {
  return (
    <div className="divide-y divide-border border-t border-border">
      {games.map((g) => (
        <div key={g.game} className="flex items-center gap-3 px-5 py-3">
          <GameArtTile game={g.game} className="h-10 w-10 shrink-0 rounded-[8px]" hideLabel imgWidth={120} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium">{g.game}</span>
              <span className="text-stat shrink-0 text-xs text-muted">
                {g.wins}–{g.losses} · {g.winRate === null ? "—" : `${g.winRate}%`}
              </span>
            </div>
            <WinRateBar value={g.winRate} />
          </div>
          <span
            className={`w-12 shrink-0 text-right font-mono text-sm font-semibold tabular-nums ${g.rank ? "text-gold" : "text-muted"}`}
            title={g.rank ? `Ranked #${g.rank} in ${g.game}` : "Unranked"}
          >
            {g.rank ? `#${g.rank}` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function ProfileHeader({ data }: { data: ProfileData }) {
  const { player, stats, isOwnProfile } = data;
  const joined = player.createdAt.toLocaleDateString("en-NG", { month: "long", year: "numeric" });

  const statCells: Stat[] = [
    {
      label: "Record",
      value: (
        <>
          <span className="text-success">{stats.wins}</span>
          <span className="px-1 text-muted">–</span>
          <span>{stats.losses}</span>
        </>
      ),
      sub: `${stats.played} ${stats.played === 1 ? "match" : "matches"}`,
    },
    {
      label: "Win rate",
      value: stats.winRate === null ? "—" : `${stats.winRate}%`,
      sub: stats.played === 0 ? "No matches yet" : "All games",
    },
    {
      label: "Streak",
      value: stats.streak ? (
        <span className={stats.streak.result === "W" ? "text-success" : "text-danger"}>
          {stats.streak.result}
          {stats.streak.count}
        </span>
      ) : (
        "—"
      ),
      sub: stats.streak ? (stats.streak.result === "W" ? "Winning run" : "Losing run") : "Current run",
    },
    {
      label: "Best rank",
      value: stats.bestRank ? `#${stats.bestRank.rank}` : "—",
      sub: stats.bestRank ? stats.bestRank.game : `${stats.tournaments} ${stats.tournaments === 1 ? "tournament" : "tournaments"}`,
    },
  ];

  return (
    <header data-surface="dark" className="overflow-hidden rounded-[var(--radius-hero)] border border-border">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
        {/* Grid, not nested flex: on phones the bio/details drop below the
            avatar+name row and use the full width; from sm up they sit in
            the name column beside a taller avatar. */}
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 sm:gap-x-5">
          <div className="relative shrink-0 rounded-full p-[3px] ring-2 ring-accent-volt sm:row-span-2">
            <PlayerAvatar person={player} size="lg" />
            {isOwnProfile && (
              <Link
                href="/account"
                aria-label="Change profile photo"
                className="absolute right-0 bottom-0 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-muted transition hover:text-foreground"
              >
                <Pencil size={12} />
              </Link>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5 sm:self-end">
            <h1 className="truncate font-display text-3xl leading-none font-bold tracking-tight uppercase sm:text-[40px]">
              {player.displayName}
            </h1>
            <span className="truncate text-sm font-medium text-foreground/80">@{player.handle}</span>
          </div>
          <div className="col-span-2 flex min-w-0 flex-col gap-2 sm:col-span-1 sm:col-start-2 sm:self-start">
            {player.bio ? (
              <p className="max-w-lg text-sm text-foreground/80">{player.bio}</p>
            ) : (
              isOwnProfile && (
                <Link href="/account" className="w-fit text-sm text-muted transition hover:text-foreground">
                  Add a short bio →
                </Link>
              )
            )}
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <CalendarDays size={12} />
                Joined {joined}
              </span>
              {player.region && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={12} />
                  {player.region}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isOwnProfile ? (
            <Link href="/account" className="btn-secondary">
              <Pencil size={13} />
              Edit profile
            </Link>
          ) : (
            data.viewerSignedIn && data.friendStatus && <FriendButton targetHandle={player.handle} status={data.friendStatus} />
          )}
          <ShareButton variant="compact" title={`${player.displayName} on Circuit`} url={data.profileUrl} />
          {!isOwnProfile && data.viewerSignedIn && (
            <Link
              href={`/players/${player.handle}/report`}
              aria-label={`Report ${player.displayName}`}
              title="Report player"
              className="btn-icon text-muted hover:text-foreground"
            >
              <Flag size={16} />
            </Link>
          )}
        </div>
      </div>

      <StatStrip stats={statCells} />
    </header>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

const ATTENTION_ICON = { match: Swords, registration: Trophy, battle: Gamepad2 } as const;

function Overview({ data }: { data: ProfileData }) {
  const { isOwnProfile, player } = data;
  const unlocked = data.achievements.filter((a) => a.unlocked).length;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        {isOwnProfile && data.attention.length > 0 && (
          <Panel title="Needs your attention" meta={data.attention.length}>
            <div className="divide-y divide-border border-t border-border">
              {data.attention.map((item) => {
                const Icon = ATTENTION_ICON[item.kind];
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="group flex items-center gap-3 px-5 py-3 transition-colors duration-[var(--duration-fast)] hover:bg-surface-elevated/60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-surface-elevated text-muted">
                      <Icon size={16} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{item.title}</span>
                      <span className="text-metadata truncate">{item.subtitle}</span>
                    </div>
                    {item.status && (
                      <StatusPill tone={item.status.tone} pulse={item.status.pulse}>
                        {item.status.label}
                      </StatusPill>
                    )}
                    <ChevronRight size={14} className="shrink-0 text-muted" />
                  </Link>
                );
              })}
            </div>
          </Panel>
        )}

        <Panel
          title="Recent battles"
          meta={data.matches.length > 0 ? data.matches.length : undefined}
          action={data.matches.length > 5 ? <ViewAll tab="matches" /> : undefined}
        >
          {data.form.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
              <span className="text-eyebrow text-muted">Form</span>
              <FormStrip form={data.form} />
            </div>
          )}
          {data.matches.length === 0 ? (
            <div className="flex flex-col items-start gap-3 border-t border-border px-5 py-6">
              <p className="text-sm text-muted">
                {isOwnProfile ? "Your match history starts with your first battle." : `${player.displayName} hasn't finished a match yet.`}
              </p>
              {isOwnProfile && (
                <Link href="/compete" className="btn-primary">
                  Find a competition
                </Link>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border border-t border-border">
              {data.matches.slice(0, 5).map((m) => (
                <MatchRow key={m.id} match={m} />
              ))}
            </div>
          )}
        </Panel>

        {data.gameStats.length > 0 && (
          <Panel title="Game performance" action={data.gameStats.length > 3 ? <ViewAll tab="matches" /> : undefined}>
            <GameRows games={data.gameStats.slice(0, 3)} />
          </Panel>
        )}
      </div>

      <aside className="flex min-w-0 flex-col gap-6">
        <Panel title="Achievements" meta={`${unlocked}/${data.achievements.length}`}>
          <ul className="divide-y divide-border border-t border-border">
            {data.achievements.map((a) => (
              <li key={a.key} className="flex items-center gap-3 px-5 py-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    a.unlocked ? "bg-accent-volt text-accent-volt-foreground" : "bg-surface-elevated text-muted"
                  }`}
                >
                  <span className="sr-only">{a.unlocked ? "Unlocked:" : "Locked:"}</span>
                  {a.unlocked ? <Check size={16} strokeWidth={3} aria-hidden /> : <Lock size={14} aria-hidden />}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm font-medium ${a.unlocked ? "" : "text-muted"}`}>{a.label}</span>
                    {!a.unlocked && a.progress && (
                      <span className="text-stat shrink-0 text-[11px] text-muted">
                        {Math.min(a.progress.current, a.progress.target)}/{a.progress.target}
                      </span>
                    )}
                  </div>
                  {!a.unlocked && a.progress ? (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-surface-elevated" aria-hidden>
                      <div
                        className="h-full rounded-full bg-accent-blue"
                        style={{ width: `${Math.min(100, (a.progress.current / a.progress.target) * 100)}%` }}
                      />
                    </div>
                  ) : (
                    <span className="text-metadata truncate">{a.description}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Favourite games"
          action={
            isOwnProfile ? (
              <Link href="/account" className="text-xs font-medium text-accent-blue hover:underline">
                Edit
              </Link>
            ) : undefined
          }
        >
          {player.favoriteGames.length === 0 ? (
            <PanelEmpty>
              {isOwnProfile ? (
                <Link href="/account" className="text-accent-blue hover:underline">
                  Add the games you play →
                </Link>
              ) : (
                "No favourite games listed."
              )}
            </PanelEmpty>
          ) : (
            <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
              {player.favoriteGames.map((game) => (
                <span key={game} className="flex items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 text-xs font-medium">
                  <GameArtTile game={game} className="h-6 w-6 shrink-0 rounded-full" hideLabel imgWidth={60} />
                  {game}
                </span>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Squad" action={<ViewAll tab="friends" />}>
          <div className="flex flex-col gap-4 border-t border-border px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-eyebrow text-muted">Friends</span>
                <span className="text-stat text-lg">{data.friends.accepted.length}</span>
              </div>
              {data.friends.accepted.length > 0 ? (
                <div className="flex -space-x-2">
                  {data.friends.accepted.slice(0, 5).map((f) => (
                    <Link
                      key={f.friendshipId}
                      href={`/players/${f.handle}`}
                      title={f.displayName}
                      className="rounded-full ring-2 ring-surface transition hover:z-10 hover:-translate-y-0.5"
                    >
                      <PlayerAvatar person={f} size="sm" />
                    </Link>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-muted">{isOwnProfile ? "Add friends from their profile" : "None yet"}</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-eyebrow text-muted">Teams</span>
              {data.teams.mine.length === 0 ? (
                <span className="text-xs text-muted">{isOwnProfile ? "Not on a team yet." : `Not on a team.`}</span>
              ) : (
                data.teams.mine.slice(0, 3).map((t) => (
                  <Link key={t.id} href={`/teams/${t.id}`} className="group flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Users size={14} className="shrink-0 text-muted" />
                      <span className="truncate font-medium group-hover:underline">{t.name}</span>
                      {t.tag && <span className="font-mono text-[11px] text-muted">[{t.tag}]</span>}
                    </span>
                    {t.isCaptain && <span className="badge badge-brand">Captain</span>}
                  </Link>
                ))
              )}
            </div>
          </div>
        </Panel>
      </aside>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Other tabs
// ---------------------------------------------------------------------------

function MatchesTab({ data }: { data: ProfileData }) {
  return (
    <div className="flex flex-col gap-6">
      {data.gameStats.length > 0 && (
        <Panel title="By game" meta={data.gameStats.length}>
          <GameRows games={data.gameStats} />
        </Panel>
      )}

      <Panel title="Match history" meta={data.matches.length || undefined} action={<FormStrip form={data.form.slice(0, 5)} />}>
        {data.matches.length === 0 ? (
          <PanelEmpty>No completed matches yet.</PanelEmpty>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {data.matches.map((m) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function TournamentsTab({ data }: { data: ProfileData }) {
  return (
    <Panel title="Tournaments" meta={data.registrations.length || undefined}>
      {data.registrations.length === 0 ? (
        <PanelEmpty>
          {data.isOwnProfile ? (
            <>
              No tournaments yet.{" "}
              <Link href="/compete" className="text-accent-blue hover:underline">
                Browse competitions →
              </Link>
            </>
          ) : (
            "No tournaments yet."
          )}
        </PanelEmpty>
      ) : (
        <div className="divide-y divide-border border-t border-border">
          {data.registrations.map((r) => {
            const status = registrationStatusInfo(r.status);
            return (
              <Link
                key={r.id}
                href={`/tournaments/${r.tournamentId}`}
                className="group flex items-center gap-3 px-5 py-3 transition-colors duration-[var(--duration-fast)] hover:bg-surface-elevated/60"
              >
                <GameArtTile game={r.game} className="h-10 w-10 shrink-0 rounded-[8px]" hideLabel imgWidth={120} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  <span className="text-metadata truncate">
                    {r.game} · {formatDate(r.startAt)}
                  </span>
                </div>
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
                <ChevronRight size={14} className="shrink-0 text-muted opacity-0 transition group-hover:opacity-100" />
              </Link>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function FriendsTab({ data }: { data: ProfileData }) {
  const { friends, isOwnProfile, player } = data;
  return (
    <div className="flex flex-col gap-6">
      {isOwnProfile && (
        <div className="card">
          <AddFriendForm />
        </div>
      )}
      {isOwnProfile && friends.incoming.length > 0 && (
        <Panel title="Requests" meta={friends.incoming.length}>
          <div className="flex flex-col gap-2 border-t border-border p-3">
            {friends.incoming.map((f) => (
              <FriendRequestRow key={f.friendshipId} friendshipId={f.friendshipId} person={f} kind="incoming" />
            ))}
          </div>
        </Panel>
      )}
      {isOwnProfile && friends.outgoing.length > 0 && (
        <Panel title="Sent" meta={friends.outgoing.length}>
          <div className="flex flex-col gap-2 border-t border-border p-3">
            {friends.outgoing.map((f) => (
              <FriendRequestRow key={f.friendshipId} friendshipId={f.friendshipId} person={f} kind="outgoing" />
            ))}
          </div>
        </Panel>
      )}
      <Panel title="Friends" meta={friends.accepted.length || undefined}>
        {friends.accepted.length === 0 ? (
          <PanelEmpty>{isOwnProfile ? "No friends yet — add one above, or from their profile." : `${player.displayName} hasn't added any friends yet.`}</PanelEmpty>
        ) : isOwnProfile ? (
          <div className="flex flex-col gap-2 border-t border-border p-3">
            {friends.accepted.map((f) => (
              <FriendRequestRow key={f.friendshipId} friendshipId={f.friendshipId} person={f} kind="friend" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 border-t border-border sm:grid-cols-2">
            {friends.accepted.map((f) => (
              <Link
                key={f.friendshipId}
                href={`/players/${f.handle}`}
                className="flex items-center gap-3 border-b border-border px-5 py-3 transition-colors hover:bg-surface-elevated/60 sm:odd:border-r"
              >
                <PlayerAvatar person={f} size="md" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{f.displayName}</span>
                  <span className="text-metadata">@{f.handle}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function TeamsTab({ data, viewerId }: { data: ProfileData; viewerId: string }) {
  const { teams, isOwnProfile, player } = data;
  return (
    <div className="flex flex-col gap-6">
      {isOwnProfile && (
        <div className="card">
          <CreateTeamForm />
        </div>
      )}
      {isOwnProfile && teams.invites.length > 0 && (
        <Panel title="Invites" meta={teams.invites.length}>
          <div className="flex flex-col gap-2 border-t border-border p-3">
            {teams.invites.map((m) => (
              <TeamInviteRow key={m.id} teamId={m.teamId} teamName={m.name} tag={m.tag} viewerId={viewerId} />
            ))}
          </div>
        </Panel>
      )}
      {isOwnProfile && teams.requests.length > 0 && (
        <Panel title="Your requests" meta={teams.requests.length}>
          <div className="flex flex-col gap-2 border-t border-border p-3">
            {teams.requests.map((m) => (
              <TeamRequestRow key={m.id} teamId={m.teamId} teamName={m.name} tag={m.tag} viewerId={viewerId} />
            ))}
          </div>
        </Panel>
      )}
      <Panel title="Teams" meta={teams.mine.length || undefined}>
        {teams.mine.length === 0 ? (
          <PanelEmpty>{isOwnProfile ? "Not on a team yet — create one above." : `${player.displayName} isn't on a team yet.`}</PanelEmpty>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {teams.mine.map((t) => (
              <Link
                key={t.id}
                href={`/teams/${t.id}`}
                className="group flex items-center gap-3 px-5 py-3 transition-colors duration-[var(--duration-fast)] hover:bg-surface-elevated/60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-surface-elevated font-mono text-xs font-bold text-muted uppercase">
                  {(t.tag ?? t.name).slice(0, 3)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  <span className="text-metadata">{t.game ?? "Any game"}</span>
                </div>
                {t.isCaptain && <span className="badge badge-brand shrink-0">Captain</span>}
                <ChevronRight size={14} className="shrink-0 text-muted opacity-0 transition group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function WalletTab({ wallet }: { wallet: NonNullable<ProfileData["wallet"]> }) {
  return (
    <div className="flex flex-col gap-6">
      <section data-surface="dark" className="overflow-hidden rounded-[var(--radius-hero)] border border-border">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div className="flex flex-col gap-1">
            <span className="text-eyebrow text-muted">Available balance</span>
            <span className="text-stat text-4xl leading-none">{formatNaira(wallet.balance)}</span>
          </div>
          <Link href="/wallet" className="btn-primary shrink-0">
            <WalletIcon size={14} />
            Open wallet
          </Link>
        </div>
        <dl className="grid grid-cols-1 gap-px border-t border-border bg-border sm:grid-cols-3">
          {[
            { label: "Fees & stakes paid", value: formatNaira(wallet.totalPaid), cls: "" },
            { label: "Refunded", value: formatNaira(wallet.totalRefunded), cls: "" },
            { label: "Winnings", value: formatNaira(wallet.totalWon), cls: "text-gold" },
          ].map((s) => (
            <div key={s.label} className="flex flex-col gap-1 bg-surface px-5 py-4 sm:px-7">
              <dt className="text-eyebrow text-muted">{s.label}</dt>
              <dd className={`text-stat text-xl ${s.cls}`}>{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="text-center text-xs text-muted">Only you can see this tab.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProfileView({ data, viewerId }: { data: ProfileData; viewerId: string | null }) {
  const tabs: SectionTab[] = [
    { key: "overview", label: "Overview", content: <Overview data={data} /> },
    { key: "matches", label: "Matches", count: data.matches.length, content: <MatchesTab data={data} /> },
    { key: "tournaments", label: "Tournaments", count: data.registrations.length, content: <TournamentsTab data={data} /> },
    {
      key: "friends",
      label: "Friends",
      count: data.friends.accepted.length + (data.isOwnProfile ? data.friends.incoming.length : 0),
      content: <FriendsTab data={data} />,
    },
    { key: "teams", label: "Teams", count: data.teams.mine.length, content: <TeamsTab data={data} viewerId={viewerId ?? ""} /> },
  ];
  if (data.isOwnProfile && data.wallet) {
    tabs.push({ key: "wallet", label: "Wallet", content: <WalletTab wallet={data.wallet} /> });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <ProfileHeader data={data} />
      <SectionTabs tabs={tabs} initialTab={data.initialTab} label="Profile sections" idPrefix="profile" />
    </div>
  );
}
