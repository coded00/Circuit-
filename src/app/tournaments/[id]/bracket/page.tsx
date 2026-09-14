/**
 * Circuit — live bracket view (Build Plan P3-9, maps: BRK-7).
 *
 * Rebuilt around a real tab shell (Bracket / Matches / Standings / About,
 * reusing the same `TournamentTabs` client shell the tournament page
 * already uses) plus a persistent "Champion" sidebar card — all four tabs
 * and the sidebar are real, derived data:
 * - **Round names** ("Semi Finals", "Final") are computed from real
 *   position in `structure.totalRounds`, not hardcoded per tournament.
 * - **Standings** are a real bracket placement (Champion / Runner-up /
 *   "Eliminated — Quarter Finals" / still competing), derived by walking
 *   the same `Bracket.structure` the tree renders — not a fabricated
 *   points/ranking system (single-elimination has no such thing).
 * - **No per-match score numbers.** Players submit a free-text `score`
 *   string (src/app/api/matches/[id]/results/route.ts) with no fixed
 *   format and no guaranteed per-player orientation — showing it split
 *   into two columns would risk misattributing whose number is whose.
 *   The winner is shown via a trophy + bold name instead, same as before.
 * - **No per-round dates or "Best of N" round labels.** Nothing in the
 *   schema tracks a scheduled date per round or a bracket-wide match
 *   format; only the tournament's own real `startAt` exists.
 * - **"Single Elimination"** is a real, constant fact for V1 — brackets
 *   are knockout-only (`Tournament.format` is always `"KNOCKOUT"`; see
 *   that field's own schema comment) — not a per-tournament setting.
 * - **Team size** (the `UsersRound` tag, e.g. "5v5") IS a real
 *   per-tournament setting (`Tournament.teamSize`, organizer-chosen at
 *   creation) — distinct from format: it describes players-per-side,
 *   not bracket structure. Every bracket `Match` is still a strict
 *   1-vs-1 row regardless of teamSize; Circuit has no team/roster model.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Crown, Leaf, Settings2, Swords, Trophy, Users, UsersRound } from "lucide-react";
import { prisma } from "@/lib/db";
import Poller from "@/app/Poller";
import { GameArtTile } from "@/components/GameArtTile";
import { ShareButton } from "@/components/ShareButton";
import { StatusPill, matchStatusInfo } from "@/components/StatusPill";
import { playerRankInGame } from "@/lib/standings";
import TournamentTabs, { type TournamentTab } from "../TournamentTabs";

type BracketSlot = {
  position: number;
  matchId: string | null;
  playerAId: string | null;
  playerBId: string | null;
  winnerId: string | null;
};
type BracketRound = { round: number; slots: BracketSlot[] };
type BracketStructure = { bracketSize: number; totalRounds: number; rounds: BracketRound[] };

type Player = { displayName: string; handle: string; avatarUrl: string | null };

function formatNaira(kobo: number): string {
  return `₦ ${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semi Finals";
  if (fromEnd === 2) return "Quarter Finals";
  return `Round ${round}`;
}

function Avatar({ player, size, ringClass }: { player: Player | null; size: number; ringClass: string }) {
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

function chunkPairs<T>(items: T[]): T[][] {
  const pairs: T[][] = [];
  for (let i = 0; i < items.length; i += 2) pairs.push(items.slice(i, i + 2));
  return pairs;
}

/**
 * Bracket connector "elbow": each match card gets a 12px stub reaching a
 * shared vertical trunk (positioned at exactly half of match-card height
 * above/below the pair's own midline, both computed from the fixed 36px
 * row height below — not measured via JS), and the trunk itself carries
 * one more 12px stub into the next round. 12+12=24px matches the gap-6
 * between round columns exactly, so the line lands right at the next
 * round's column edge. This is a deterministic CSS approximation, not a
 * pixel-measured connector — close enough for a 2-8 round bracket, but
 * won't perfectly re-center itself around unusually tall match cards.
 */
function BracketConnector({ hasNextRound }: { hasNextRound: boolean }) {
  if (!hasNextRound) return null;
  return (
    <>
      <div aria-hidden className="absolute top-9 right-[-12px] bottom-9 w-0 border-r-2 border-accent-volt/40" />
      <div aria-hidden className="absolute top-1/2 right-[-24px] h-0 w-3 -translate-y-1/2 border-t-2 border-accent-volt/40" />
    </>
  );
}

function MatchCard({
  slot,
  userMap,
  hasNextRound,
}: {
  slot: BracketSlot;
  userMap: Map<string, Player>;
  hasNextRound: boolean;
}) {
  return (
    <div className="card relative flex flex-col gap-0 overflow-hidden p-0">
      {[
        { id: slot.playerAId, isWinner: slot.winnerId === slot.playerAId },
        { id: slot.playerBId, isWinner: slot.winnerId === slot.playerBId },
      ].map((p, i) => {
        const player = p.id ? (userMap.get(p.id) ?? null) : null;
        return (
          <div
            key={i}
            className={`flex h-9 items-center gap-2 px-3 text-sm ${i === 0 ? "border-b border-border" : ""} ${
              p.isWinner ? "font-semibold text-foreground" : "text-muted"
            }`}
          >
            <Avatar player={player} size={22} ringClass={p.isWinner ? "border-accent-volt/60" : "border-border"} />
            <span className="truncate">{player?.displayName ?? "TBD"}</span>
            {p.isWinner && <Trophy size={13} className="ml-auto shrink-0 text-gold" />}
          </div>
        );
      })}
      {slot.matchId && (
        <Link
          href={`/matches/${slot.matchId}`}
          className="border-t border-border px-3 py-1.5 text-xs font-medium text-accent-blue hover:underline"
        >
          View match →
        </Link>
      )}
      {hasNextRound && (
        <div aria-hidden className="absolute top-1/2 right-[-12px] h-0 w-3 -translate-y-1/2 border-t-2 border-accent-volt/40" />
      )}
    </div>
  );
}

function Tag({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-elevated px-3 py-1.5 text-xs font-medium text-foreground">
      {icon}
      {children}
    </span>
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

export default async function BracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { organizer: { select: { verified: true, user: { select: { displayName: true, handle: true } } } } },
  });
  if (!tournament) notFound();

  const bracket = await prisma.bracket.findUnique({ where: { tournamentId: id } });
  if (!bracket) {
    return (
      <div className="state-block">
        <h1 className="state-title">{tournament.name}</h1>
        <p className="state-description">
          The bracket hasn&apos;t been generated yet — it appears once registration closes.
        </p>
      </div>
    );
  }

  const structure = bracket.structure as unknown as BracketStructure;
  const userIds = new Set<string>();
  for (const round of structure.rounds) {
    for (const slot of round.slots) {
      if (slot.playerAId) userIds.add(slot.playerAId);
      if (slot.playerBId) userIds.add(slot.playerBId);
    }
  }
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, displayName: true, handle: true, avatarUrl: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const matches = await prisma.match.findMany({
    where: { tournamentId: id },
    orderBy: [{ round: "asc" }, { createdAt: "asc" }],
    include: {
      playerA: { select: { displayName: true, handle: true, avatarUrl: true } },
      playerB: { select: { displayName: true, handle: true, avatarUrl: true } },
    },
  });

  const champion = structure.rounds[structure.totalRounds - 1]?.slots[0]?.winnerId ?? null;
  const championPlayer = champion ? (userMap.get(champion) ?? null) : null;
  const championRank = champion ? await playerRankInGame(tournament.game, champion) : null;

  const placements = computePlacements(structure);

  const tabs: TournamentTab[] = [
    {
      key: "bracket",
      label: "Bracket",
      content: (
        <div className="overflow-x-auto pb-4">
          <div className="flex min-w-max items-stretch gap-6">
            {structure.rounds.map((round) => {
              const isLast = round.round === structure.totalRounds;
              return (
                <div key={round.round} className="flex w-60 shrink-0 flex-col gap-4">
                  <h2 className="text-eyebrow text-center">{roundName(round.round, structure.totalRounds)}</h2>
                  <div className="flex flex-1 flex-col justify-around gap-6">
                    {chunkPairs(round.slots).map((pair, pairIndex) => (
                      <div key={pairIndex} className="relative flex flex-col gap-6">
                        {pair.map((slot) => (
                          <MatchCard key={slot.position} slot={slot} userMap={userMap} hasNextRound={!isLast} />
                        ))}
                        {pair.length === 2 && <BracketConnector hasNextRound={!isLast} />}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ),
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
                <Link key={match.id} href={`/matches/${match.id}`} className="card-row flex items-center justify-between gap-3 p-3">
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
              <Link key={p.userId} href={`/players/${player.handle}`} className="card-row flex items-center gap-3 p-3">
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
          <Link href={`/tournaments/${id}`} className="text-sm font-medium text-accent-blue hover:underline">
            View full tournament page →
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <Poller />

      <div data-surface="dark" className="relative overflow-hidden rounded-[20px] border border-border p-6 sm:p-8">
        <GameArtTile game={tournament.game} className="opacity-[0.16]" fill hideLabel imgWidth={1400} />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundImage: "linear-gradient(100deg, var(--surface) 40%, transparent)" }}
        />
        {/* Decorative accent only — no font asset exists for a literal
            "graffiti" look, so this leans on the app's own display font
            (Barlow Condensed) at a jaunty rotation instead of adding one. */}
        <div
          aria-hidden
          className="absolute top-6 right-6 z-10 hidden -rotate-6 items-start gap-1.5 sm:flex"
        >
          <Crown size={22} className="mt-1 shrink-0 text-accent-volt" />
          <span className="font-display text-xl leading-[0.9] font-bold tracking-tight text-accent-volt italic sm:text-2xl">
            Bigger
            <br />
            Players
          </span>
        </div>
        <div className="relative z-10 flex flex-col gap-3">
          <Link
            href={`/tournaments/${id}`}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition hover:text-foreground"
          >
            <ArrowLeft size={15} />
            Back to Tournament
          </Link>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-muted">{tournament.name}</span>
            <h1 className="font-display text-4xl leading-none font-bold tracking-tight uppercase sm:text-5xl">Bracket</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Tag icon={<Swords size={12} />}>{tournament.game}</Tag>
            <Tag icon={<Calendar size={12} />}>{tournament.startAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}</Tag>
            <Tag icon={<Users size={12} />}>{tournament.participantCap} Players</Tag>
            <Tag icon={<Settings2 size={12} />}>Single Elimination</Tag>
            <Tag icon={<UsersRound size={12} />}>{tournament.teamSize}</Tag>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <TournamentTabs
          tabs={tabs}
          trailing={
            <ShareButton
              title={`${tournament.name} bracket on Circuit`}
              url={`${process.env.NEXT_PUBLIC_APP_URL}/tournaments/${id}/bracket`}
            />
          }
        />

        <aside className="flex h-fit flex-col gap-4 lg:sticky lg:top-[76px]">
          <div data-surface="dark" className="card flex flex-col items-center gap-3 overflow-hidden p-6 text-center">
            <Crown size={20} className={champion ? "text-gold" : "text-muted"} />
            <div className="relative flex items-center justify-center py-1">
              <Leaf size={26} className={`-rotate-[100deg] ${champion ? "text-gold/70" : "text-muted/40"}`} />
              <div
                className="relative mx-1 rounded-full"
                style={champion ? { boxShadow: "0 0 0 3px var(--gold), 0 0 32px 6px color-mix(in srgb, var(--gold) 55%, transparent)" } : undefined}
              >
                <Avatar player={championPlayer} size={84} ringClass={champion ? "border-gold" : "border-border-strong"} />
              </div>
              <Leaf size={26} className={`-scale-x-100 rotate-[100deg] ${champion ? "text-gold/70" : "text-muted/40"}`} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-eyebrow text-gold">Champion</span>
              <span className="font-display text-2xl font-bold tracking-tight">{championPlayer?.displayName ?? "TBD"}</span>
              {championPlayer && <span className="text-xs text-muted">@{championPlayer.handle}</span>}
            </div>
            {championRank != null && <span className="text-xs font-semibold text-gold">Rank #{championRank}</span>}
            <p className="text-xs text-muted">
              {champion ? "Crowned after the Final." : "Still to be decided — check back once the Final is played."}
            </p>
            <p className="border-t border-border pt-3 text-xs text-muted italic">&ldquo;Same game. Bigger players.&rdquo;</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
