/**
 * Circuit — Challenge detail page (Build Plan P4-1/P4-4/P4-6; user-facing
 * "Challenges" is this same underlying `Battle` feature, just renamed —
 * no schema/logic changes).
 *
 * Built around "you are here to challenge someone": the two real
 * competitors are the hero, not the game's title. A full-bleed dark arena
 * canvas (not a card floating on a light page) puts the host on one side
 * and either the real opponent (matched), the real invited player (a
 * still-open targeted challenge), or an honest dashed empty slot (open to
 * anyone) on the other — never a filled-in stranger. A persistent sidebar
 * (Match Details / How It Works / Share) turns this into a real two-column
 * layout instead of a single centered form.
 *
 * Stake is real when set (`Battle.stakeAmount` > 0, escrowed at creation
 * and matched at accept — see the creation/accept routes' own comments)
 * — the header's stat slot and Match Details' "Entry Fee" row both show
 * the real amount instead of a hardcoded "Free".
 *
 * A few things a supplied reference design showed that Circuit has no real
 * data for are deliberately not invented:
 * - **No "Level" chip.** `AccountMenu.tsx` already ships one narrow,
 *   explicitly-decided decorative "Level 24" (Circuit has no Level/XP
 *   system); this page doesn't extend that exception further.
 * - **No formal "Challenge Rules" document.** There's no rules page or
 *   Code of Conduct route to link to, and no per-Battle rules text field.
 *   "How It Works" states three real, verifiable facts about the actual
 *   Match/Dispute engine (src/lib/matches.ts) instead.
 * - **Win/Loss/Win Rate ARE real** — `gameStandings(game)`, the same
 *   aggregation the ladder and public profile pages already use — shown
 *   only for a side that has actually completed matches in this game.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Tv, Zap } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { GameArtTile } from "@/components/GameArtTile";
import { ShareButton } from "@/components/ShareButton";
import { StatusPill, battleStatusInfo } from "@/components/StatusPill";
import { gameStandings, type Standing } from "@/lib/standings";
import { getFriendIds } from "@/lib/friends";
import { CountUp } from "@/components/CountUp";
import AcceptButton from "./AcceptButton";
import CancelBattleButton from "./CancelBattleButton";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function formatRelative(date: Date): string {
  const diffMin = Math.round((date.getTime() - Date.now()) / 60000);
  if (Math.abs(diffMin) < 60) return relativeTime.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return relativeTime.format(diffHour, "hour");
  return relativeTime.format(Math.round(diffHour / 24), "day");
}

function formatLabel(format: string): string {
  return format === "BEST_OF_3" ? "Best of 3" : "Single match";
}

/** `size` is the full desktop size — below that, the circle scales down
 *  fluidly (never below ~70% of it) with the viewport, since two of these
 *  sit side-by-side in a fixed-layout VS row (see below) and a rigid
 *  104px circle on each side leaves near-zero breathing room at 320px. */
function fluidCircle(size: number): string {
  return `clamp(${Math.round(size * 0.7)}px, 20vw, ${size}px)`;
}

function Avatar({
  avatarUrl,
  name,
  ringClass,
  size,
}: {
  avatarUrl: string | null;
  name: string;
  ringClass: string;
  size: number;
}) {
  const style = { height: fluidCircle(size), width: fluidCircle(size) };
  return avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
    <img src={avatarUrl} alt="" style={style} className={`rounded-full border-2 object-cover ${ringClass}`} />
  ) : (
    <div
      style={style}
      className={`flex items-center justify-center rounded-full border-2 bg-surface text-2xl font-semibold text-muted ${ringClass}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function EmptySlot({ size }: { size: number }) {
  return (
    <div
      style={{ height: fluidCircle(size), width: fluidCircle(size) }}
      className="flex items-center justify-center rounded-full border-2 border-dashed border-border-strong text-3xl font-bold text-muted"
    >
      ?
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "volt" | "orange" | "neutral" }) {
  const toneClass =
    tone === "volt"
      ? "border-accent-volt/50 text-accent-volt"
      : tone === "orange"
        ? "border-accent-orange/50 text-accent-orange"
        : "border-border-strong text-muted";
  return (
    <span className={`rounded-full border px-3 py-1 text-[11px] font-bold tracking-wide uppercase ${toneClass}`}>
      {children}
    </span>
  );
}

function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) return null;
  return (
    <span className="text-xs font-semibold text-gold">
      Rank #<CountUp value={rank} />
    </span>
  );
}

function StatsRow({ standing }: { standing: Standing | undefined }) {
  if (!standing) return null;
  const played = standing.wins + standing.losses;
  if (played === 0) return null;
  const winRate = Math.round((standing.wins / played) * 100);
  return (
    <div className="flex items-center gap-4">
      {[
        { label: "Wins", value: standing.wins },
        { label: "Losses", value: standing.losses },
        { label: "Win Rate", value: `${winRate}%` },
      ].map((s) => (
        <div key={s.label} className="flex flex-col items-center">
          <span className="text-sm font-bold text-foreground">{s.value}</span>
          <span className="text-[10px] tracking-wide text-muted uppercase">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function howItWorks(stakeAmount: number): string[] {
  return [
    "Both players submit their result — matching reports settle the match instantly.",
    "Reports don't match? Circuit staff step in to review and rule.",
    stakeAmount > 0
      ? `Staked ${formatNaira(stakeAmount)} each — the winner takes the full ${formatNaira(stakeAmount * 2)} pot. A voided dispute returns both stakes.`
      : "Free to enter — no stakes, no entry fee.",
  ];
}

export default async function BattlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const battle = await prisma.battle.findUnique({
    where: { id },
    include: {
      creator: { select: { displayName: true, handle: true, avatarUrl: true } },
      targetUser: { select: { displayName: true, handle: true, avatarUrl: true } },
      matches: {
        select: {
          id: true,
          createdAt: true,
          playerA: { select: { id: true, displayName: true, handle: true, avatarUrl: true } },
          playerB: { select: { id: true, displayName: true, handle: true, avatarUrl: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!battle) notFound();

  const user = await getCurrentUser();
  const isCreator = user !== null && user.id === battle.creatorId;
  const isFriendOfCreator =
    user !== null && battle.visibility === "FRIENDS" ? (await getFriendIds(battle.creatorId)).includes(user.id) : false;
  const canAccept =
    user !== null &&
    !isCreator &&
    battle.status === "OPEN" &&
    (battle.visibility === "OPEN" || battle.targetUserId === user.id || isFriendOfCreator);

  // A real Match row is the only thing that means "matched" — targetUserId
  // being set just means someone was *invited*, not that they've accepted
  // (a prior version of this page conflated the two, which made a still-
  // open targeted challenge render as if it were already underway).
  const realMatch = battle.matches[0] ?? null;
  const matchOpponent = realMatch ? (realMatch.playerA.id === battle.creatorId ? realMatch.playerB : realMatch.playerA) : null;
  const isMatched = battle.status === "ACCEPTED" || battle.status === "COMPLETE" || Boolean(realMatch);
  const isTargetedOpen = !isMatched && battle.visibility === "TARGETED" && Boolean(battle.targetUser);
  const cancelled = battle.status === "CANCELLED";

  const opponent = matchOpponent ?? (isTargetedOpen ? battle.targetUser : null);
  const opponentId = matchOpponent?.id ?? (isTargetedOpen ? battle.targetUserId : null) ?? null;

  // One real aggregation covers rank AND win/loss/win-rate for both sides —
  // the same `gameStandings` the ladder and public profile pages use.
  const standings = await gameStandings(battle.game);
  const creatorIndex = standings.findIndex((s) => s.userId === battle.creatorId);
  const creatorRank = creatorIndex === -1 ? null : creatorIndex + 1;
  const creatorStanding = creatorIndex === -1 ? undefined : standings[creatorIndex];
  const opponentIndex = opponentId ? standings.findIndex((s) => s.userId === opponentId) : -1;
  const opponentRank = opponentIndex === -1 ? null : opponentIndex + 1;
  const opponentStanding = opponentIndex === -1 ? undefined : standings[opponentIndex];

  const status = battleStatusInfo(battle.status);
  const formatText = formatLabel(battle.format);

  // Only a viewer who could personally accept an open-to-anyone slot right
  // now gets framed as "You" — a logged-out guest or the creator viewing
  // their own post still see the honest "Any Challenger" empty slot.
  const viewerIsInvitee = canAccept && !opponent;

  const rightName = opponent ? opponent.displayName : viewerIsInvitee ? "You" : "Any Challenger";
  const rightAvatarUrl = opponent?.avatarUrl ?? (viewerIsInvitee ? (user?.avatarUrl ?? null) : null);
  const rightIsEmpty = !opponent && !rightAvatarUrl;
  const rightTag = isMatched ? "Opponent" : isTargetedOpen ? "Invited" : viewerIsInvitee ? "Challenger" : "Open Slot";
  const rightRank = isMatched ? opponentRank : null;

  const caption = isMatched
    ? null
    : isTargetedOpen
      ? `Waiting for @${battle.targetUser!.handle} to accept`
      : viewerIsInvitee
        ? "Think you can take them down?"
        : "Waiting for a challenger";

  return (
    <div data-surface="dark" className="w-full flex-1 bg-background">
      <div className="mx-auto grid w-full max-w-[1400px] gap-6 px-6 py-8 sm:px-8 sm:py-10 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/battles"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-foreground"
            >
              <ArrowLeft size={15} />
              Back to Challenges
            </Link>
            <StatusPill tone={status.tone} pulse={status.pulse}>
              {battle.status === "OPEN" ? (
                <>
                  <Zap size={13} />
                  Open Challenge
                </>
              ) : (
                status.label
              )}
            </StatusPill>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <GameArtTile game={battle.game} hideLabel className="h-16 w-16 shrink-0 rounded-[14px]" />
              <div className="flex flex-col gap-1.5">
                <h1 className="font-display text-3xl leading-none font-bold tracking-tight uppercase sm:text-4xl">
                  {battle.game}
                </h1>
                <div className="flex flex-wrap gap-2">
                  <Tag tone="neutral">1v1</Tag>
                  <Tag tone="neutral">{formatText}</Tag>
                  {battle.visibility === "FRIENDS" && <Tag tone="volt">Friends Only</Tag>}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="text-eyebrow text-muted">{battle.stakeAmount > 0 ? "Stake" : "Entry"}</span>
              <span className="font-display text-2xl font-bold text-foreground">
                {battle.stakeAmount > 0 ? formatNaira(battle.stakeAmount) : "Free"}
              </span>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[20px] border border-border bg-surface p-6 sm:p-10">
            <GameArtTile game={battle.game} className="opacity-[0.18]" fill hideLabel imgWidth={1200} />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{ backgroundImage: "linear-gradient(180deg, transparent, var(--surface) 78%)" }}
            />

            <div className="relative z-10 flex flex-col items-center gap-6">
              <div className="flex w-full items-start justify-center gap-4 sm:gap-12">
                <div className="flex flex-1 flex-col items-center gap-3">
                  <Tag tone="volt">Host</Tag>
                  <Avatar
                    avatarUrl={battle.creator.avatarUrl}
                    name={battle.creator.displayName}
                    ringClass="border-accent-volt/60"
                    size={104}
                  />
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-display text-xl font-bold tracking-tight sm:text-2xl">
                      {battle.creator.displayName}
                    </span>
                    <span className="text-xs text-muted">@{battle.creator.handle}</span>
                    <RankBadge rank={creatorRank} />
                  </div>
                  <StatsRow standing={creatorStanding} />
                </div>

                <span className="font-display shrink-0 pt-10 text-2xl font-bold text-muted">VS</span>

                <div className="flex flex-1 flex-col items-center gap-3">
                  <Tag tone={isMatched ? "orange" : "neutral"}>{rightTag}</Tag>
                  {rightIsEmpty ? (
                    <EmptySlot size={104} />
                  ) : (
                    <Avatar avatarUrl={rightAvatarUrl} name={rightName} ringClass="border-accent-orange/60" size={104} />
                  )}
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-display text-xl font-bold tracking-tight sm:text-2xl">{rightName}</span>
                    {opponent && <span className="text-xs text-muted">@{opponent.handle}</span>}
                    <RankBadge rank={rightRank} />
                  </div>
                  {opponentStanding ? (
                    <StatsRow standing={opponentStanding} />
                  ) : (
                    <p className="max-w-[160px] rounded-[10px] bg-surface-elevated px-3 py-2 text-center text-xs text-muted">
                      {viewerIsInvitee ? "Your stats could show here." : "Stats will show here once matched."}
                    </p>
                  )}
                </div>
              </div>

              {caption && <p className="text-sm text-muted">{caption}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {battle.streamUrl && (
              <a href={battle.streamUrl} target="_blank" rel="noreferrer" className="btn-secondary">
                <Tv size={14} />
                Watch stream
              </a>
            )}
            <ShareButton
              title={`${battle.creator.displayName}'s ${battle.game} Challenge on Circuit`}
              url={`${process.env.NEXT_PUBLIC_APP_URL}/battles/${battle.id}`}
            />
          </div>

          {cancelled && <p className="alert alert-danger">This Challenge was cancelled.</p>}

          <div className="flex flex-col items-center gap-2">
            {isMatched && realMatch && (
              <Link href={`/matches/${realMatch.id}`} className="btn-primary w-full sm:w-fit">
                {battle.status === "COMPLETE" ? "View Result →" : "View Matchup →"}
              </Link>
            )}
            {isCreator && battle.status === "OPEN" && <CancelBattleButton battleId={battle.id} />}
            {canAccept && (
              <>
                <AcceptButton battleId={battle.id} />
                <p className="text-xs text-muted">
                  {battle.stakeAmount > 0
                    ? `By accepting, ${formatNaira(battle.stakeAmount)} is locked from your wallet and you're committed to this match.`
                    : "By accepting, you're locked into this match."}
                </p>
              </>
            )}
            {!user && battle.status === "OPEN" && (
              <>
                <Link href={`/login?next=${encodeURIComponent(`/battles/${battle.id}`)}`} className="btn-primary w-full sm:w-fit">
                  Log in to accept →
                </Link>
                <p className="text-xs text-muted">
                  Don&apos;t have an account?{" "}
                  <Link href="/signup" className="font-medium text-accent-blue hover:underline">
                    Sign up free
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="widget flex flex-col gap-1">
            <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Match Details</h2>
            <div className="flex flex-col divide-y divide-border">
              <DetailRow label="Players" value={isMatched ? "2 / 2" : "1 / 2"} />
              <DetailRow label="Format" value={formatText} />
              <DetailRow label="Game Mode" value="1v1" />
              <DetailRow label={battle.stakeAmount > 0 ? "Stake (each)" : "Entry Fee"} value={battle.stakeAmount > 0 ? formatNaira(battle.stakeAmount) : "Free"} />
              <DetailRow
                label={battle.status === "ACCEPTED" ? "Matched" : "Opened"}
                value={formatRelative(realMatch?.createdAt ?? battle.createdAt)}
              />
            </div>
          </div>

          <div className="widget flex flex-col gap-3">
            <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">How It Works</h2>
            <ul className="flex flex-col gap-2.5">
              {howItWorks(battle.stakeAmount).map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm text-muted">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-accent-blue" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="widget flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Share Challenge</h2>
              <p className="text-metadata">Get more contenders.</p>
            </div>
            <ShareButton
              variant="inline"
              title={`${battle.creator.displayName}'s ${battle.game} Challenge on Circuit`}
              url={`${process.env.NEXT_PUBLIC_APP_URL}/battles/${battle.id}`}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
