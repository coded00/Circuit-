/**
 * Circuit — the real render body of the bracket view (Build Plan P3-9,
 * maps: BRK-7), extracted so both the player-facing `/tournaments/[id]/
 * bracket` page and the admin-native bracket page render the exact same
 * tree/standings/about content — only where the internal links point
 * (a match, a player, the tournament itself) differs per surface, via
 * the href-builder props below. See this file's data-fetching callers
 * for what's real vs. deliberately not invented (documented there, not
 * duplicated here).
 */

import Link from "next/link";
import { ArrowLeft, Share2, Trophy } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { ShareButton } from "@/components/ShareButton";
import { StatusPill, matchStatusInfo } from "@/components/StatusPill";
import TournamentTabs, { type TournamentTab } from "../TournamentTabs";
import { BracketRounds } from "./BracketRounds";

export type BracketSlot = {
  position: number;
  matchId: string | null;
  playerAId: string | null;
  playerBId: string | null;
  winnerId: string | null;
};
export type BracketRound = { round: number; slots: BracketSlot[] };
export type BracketStructure = { bracketSize: number; totalRounds: number; rounds: BracketRound[] };

export type Player = { id: string; displayName: string; handle: string; avatarUrl: string | null };

type ViewMatch = {
  id: string;
  round: number | null;
  status: string;
  playerA: { displayName: string };
  playerB: { displayName: string };
};

type ViewTournament = {
  id: string;
  name: string;
  game: string;
  startAt: Date;
  entryFee: number;
  prizeAmount: number | null;
  prizeText: string | null;
  rulesText: string | null;
  participantCap: number;
  teamSize: string;
  posterUrl: string | null;
  organizer: { verified: boolean; user: { handle: string } };
};

function formatNaira(kobo: number): string {
  return `₦ ${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

export function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semi Finals";
  if (fromEnd === 2) return "Quarter Finals";
  return `Round ${round}`;
}

export function Avatar({ player, size, ringClass }: { player: Player | null; size: number; ringClass: string }) {
  const px = `${size}px`;
  if (!player) {
    return (
      <div
        style={{ height: px, width: px }}
        className="flex items-center justify-center rounded-full border-2 border-dashed border-border-strong text-muted"
      >
        ?
      </div>
    );
  }
  return player.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
    <img
      src={player.avatarUrl}
      alt=""
      style={{ height: px, width: px }}
      className={`rounded-full border-2 object-cover ${ringClass}`}
    />
  ) : (
    <div
      style={{ height: px, width: px }}
      className={`flex items-center justify-center rounded-full border-2 bg-surface-elevated text-sm font-semibold text-muted ${ringClass}`}
    >
      {player.displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}


type Placement = { userId: string; label: string; roundReached: number; status: "champion" | "runner-up" | "eliminated" | "active" };

function computePlacements(structure: BracketStructure): Placement[] {
  const furthest = new Map<string, { round: number; slot: BracketSlot }>();
  for (const round of structure.rounds) {
    for (const slot of round.slots) {
      for (const uid of [slot.playerAId, slot.playerBId]) {
        if (!uid) continue;
        const existing = furthest.get(uid);
        if (!existing || round.round > existing.round) furthest.set(uid, { round: round.round, slot });
      }
    }
  }

  const placements: Placement[] = [];
  for (const [userId, { round, slot }] of furthest) {
    const isFinalRound = round === structure.totalRounds;
    if (isFinalRound && slot.winnerId === userId) {
      placements.push({ userId, label: "Champion", roundReached: round, status: "champion" });
    } else if (isFinalRound && slot.winnerId) {
      placements.push({ userId, label: "Runner-up", roundReached: round, status: "runner-up" });
    } else if (slot.winnerId && slot.winnerId !== userId) {
      placements.push({ userId, label: `Eliminated — ${roundName(round, structure.totalRounds)}`, roundReached: round, status: "eliminated" });
    } else {
      placements.push({ userId, label: `Competing — ${roundName(round, structure.totalRounds)}`, roundReached: round, status: "active" });
    }
  }

  const statusRank: Record<Placement["status"], number> = { champion: 0, "runner-up": 1, active: 2, eliminated: 2 };
  return placements.sort((a, b) => statusRank[a.status] - statusRank[b.status] || b.roundReached - a.roundReached);
}

export function BracketView({
  tournament,
  structure,
  users,
  matches,
  championRank,
  topFragger,
  backHref,
  matchHrefBase,
  playerHref,
  tournamentHref,
  shareUrl,
}: {
  tournament: ViewTournament;
  structure: BracketStructure;
  users: Player[];
  matches: ViewMatch[];
  championRank: number | null;
  /** Highest self-reported kills across the tournament — omit/null hides
   *  the Top Fragger card rather than crowning a fabricated 0-kill
   *  "winner" (see `computeTopFragger`'s own doc on why this can be null:
   *  not every game has a kill count, and nobody's required to enter one). */
  topFragger?: { userId: string; totalKills: number } | null;
  /** "Back to Tournament" at the top of the hero card. */
  backHref: string;
  /** Prefix only (e.g. "/matches" or "/admin/matches") — `${matchHrefBase}/${matchId}`
   *  builds the real link. A plain string, not a function: `BracketRounds`
   *  is a client component, and a function prop can't cross that server →
   *  client boundary the way a string can. */
  matchHrefBase: string;
  playerHref: (userId: string, handle: string) => string;
  /** "View full tournament page →" in the About tab — omit to hide it. */
  tournamentHref?: string;
  /** Omit to hide the share button (an admin viewing this isn't sharing it). */
  shareUrl?: string;
}) {
  const userMap = new Map(users.map((u) => [u.id, u]));
  const champion = structure.rounds[structure.totalRounds - 1]?.slots[0]?.winnerId ?? null;
  const championPlayer = champion ? (userMap.get(champion) ?? null) : null;
  const placements = computePlacements(structure);
  const topFraggerPlayer = topFragger ? (userMap.get(topFragger.userId) ?? null) : null;

  const tabs: TournamentTab[] = [
    {
      key: "bracket",
      label: "Bracket",
      content: <BracketRounds structure={structure} users={users} matchHrefBase={matchHrefBase} />,
    },
    {
      key: "matches",
      label: "Matches",
      content:
        matches.length === 0 ? (
          <p className="card text-center text-muted">No matches yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {matches.map((match) => {
              const status = matchStatusInfo(match.status);
              return (
                <Link key={match.id} href={`${matchHrefBase}/${match.id}`} className="card-row flex items-center justify-between gap-3 p-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-metadata">{roundName(match.round ?? 0, structure.totalRounds)}</span>
                    <span className="truncate text-sm font-medium">
                      {match.playerA.displayName} <span className="text-muted">vs</span> {match.playerB.displayName}
                    </span>
                  </div>
                  <StatusPill tone={status.tone} pulse={status.pulse}>
                    {status.label}
                  </StatusPill>
                </Link>
              );
            })}
          </div>
        ),
    },
    {
      key: "standings",
      label: "Standings",
      content: (
        <div className="flex flex-col gap-2">
          {placements.map((p) => {
            const player = userMap.get(p.userId);
            if (!player) return null;
            return (
              <Link key={p.userId} href={playerHref(p.userId, player.handle)} className="card-row flex items-center gap-3 p-3">
                <Avatar player={player} size={32} ringClass={p.status === "champion" ? "border-gold" : "border-border"} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{player.displayName}</span>
                  <span className="text-metadata truncate">@{player.handle}</span>
                </div>
                <span className={`shrink-0 text-xs font-semibold ${p.status === "champion" ? "text-gold" : "text-muted"}`}>{p.label}</span>
              </Link>
            );
          })}
        </div>
      ),
    },
    {
      key: "about",
      label: "About",
      content: (
        <div className="flex flex-col gap-4">
          <div className="widget flex flex-col divide-y divide-border">
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-muted">Format</span>
              <span className="font-semibold">Single Elimination</span>
            </div>
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-muted">Entry Fee</span>
              <span className="font-semibold">{tournament.entryFee === 0 ? "Free" : formatNaira(tournament.entryFee)}</span>
            </div>
            {(tournament.prizeAmount || tournament.prizeText) && (
              <div className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-muted">Prize</span>
                <span className="font-semibold text-gold">
                  {tournament.prizeAmount ? formatNaira(tournament.prizeAmount) : tournament.prizeText}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-muted">Organized by</span>
              <span className="flex items-center gap-1 font-semibold">
                @{tournament.organizer.user.handle}
                {tournament.organizer.verified && <Trophy size={12} className="text-accent-blue" />}
              </span>
            </div>
          </div>
          {tournament.rulesText && (
            <div className="widget flex flex-col gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Rules</h2>
              <p className="text-sm whitespace-pre-wrap text-muted">{tournament.rulesText}</p>
            </div>
          )}
          {tournamentHref && (
            <Link href={tournamentHref} className="text-sm font-medium text-accent-blue hover:underline">
              View full tournament page →
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <header data-surface="dark" className="flex flex-col gap-4 rounded-[var(--radius-hero)] border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex min-w-0 items-center gap-4">
          <GameArtTile game={tournament.game} posterUrl={tournament.posterUrl} className="hidden h-16 w-24 shrink-0 rounded-[10px] sm:block" hideLabel imgWidth={240} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <Link href={backHref} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition hover:text-foreground">
              <ArrowLeft size={15} />
              <span className="truncate">{tournament.name}</span>
            </Link>
            <h1 className="font-display text-3xl leading-none font-bold tracking-tight uppercase sm:text-4xl">Bracket</h1>
            <span className="text-xs text-muted">
              {tournament.game} · Single elimination · {tournament.teamSize} · {tournament.participantCap} players ·{" "}
              {tournament.startAt.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <TournamentTabs tabs={tabs} trailing={shareUrl ? <ShareButton key="share" title={`${tournament.name} bracket on Circuit`} url={shareUrl} /> : undefined} />

        <aside className="flex h-fit flex-col gap-4 lg:sticky lg:top-[76px]">
          <section className={`card flex flex-col items-center gap-3 p-6 text-center ${champion ? "border-gold/40" : ""}`}>
            <span className="text-eyebrow text-gold">Champion</span>
            <div className={`rounded-full p-[3px] ring-2 ${champion ? "motion-scale-in ring-gold" : "ring-border-strong"}`}>
              <Avatar player={championPlayer} size={80} ringClass="border-transparent" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-display text-2xl font-bold tracking-tight uppercase">{championPlayer?.displayName ?? "TBD"}</span>
              {championPlayer && <span className="text-xs text-muted">@{championPlayer.handle}</span>}
              {championRank != null && <span className="text-stat mt-1 text-xs text-gold">Rank #{championRank}</span>}
            </div>
            <p className="text-xs text-muted">{champion ? "Crowned after the Final." : "Decided when the Final is played."}</p>
            {champion && (
              <Link href={`/share/champion/${tournament.id}`} className="btn-secondary w-full text-sm">
                <Share2 size={13} />
                Share champion card
              </Link>
            )}
          </section>

          {topFraggerPlayer && (
            <section className="card flex items-center gap-3 p-4">
              <Avatar player={topFraggerPlayer} size={44} ringClass="border-accent-blue" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-eyebrow text-accent-blue">Top fragger</span>
                <span className="truncate text-sm font-semibold">{topFraggerPlayer.displayName}</span>
                <span className="text-stat text-xs text-muted">{topFragger!.totalKills} kills</span>
              </div>
              <Link href={`/share/kills/${tournament.id}`} aria-label="Share top fragger card" className="btn-icon text-muted hover:text-foreground">
                <Share2 size={15} />
              </Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
