/**
 * Circuit — match page presentation (page.tsx does the queries). Built as
 * a head-to-head competitive screen on the same dark surface as the
 * Challenge page it's reached from:
 *
 *   Head-to-head   — both players facing each other, each with their live
 *                    state (Ready / Reported / Winner), VS or the final
 *                    score between them, and the match code front and
 *                    centre (it has to appear in the proof).
 *   Progress       — Ready up → Play → Report → Result, so it's always
 *                    obvious where the match stands.
 *   Next step      — one panel for whatever the viewer should do now.
 *   Evidence, Activity.
 */

import Link from "next/link";
import { ArrowLeft, Check, Flag, Share2, Timer, Trophy, Wallet } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { StatusPill, type StatusTone } from "@/components/StatusPill";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Spinner } from "@/components/Spinner";
import { Panel, PanelBody, PanelRows, panelRowClass } from "@/components/ui/Panel";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { CopyCode } from "@/components/ui/CopyCode";
import ResultForm from "./ResultForm";
import RulingForm from "./RulingForm";
import EnterMatchButton from "./EnterMatchButton";

export type MatchPlayer = {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  /** Battle standings in this game, when the player has any. */
  standing: { rank: number; wins: number; losses: number } | null;
  ready: boolean;
  reported: boolean;
  proofUrl: string | null;
};

export type MatchViewData = {
  id: string;
  code: string;
  status: "UPCOMING" | "NEEDS_RESULT" | "DISPUTED" | "COMPLETE";
  statusPill: { tone: StatusTone; label: string; pulse?: boolean };
  kind: "battle" | "tournament";
  game: string | null;
  /** "Single match" / "Best of 3", or "Round 2" for a bracket match. */
  formatLabel: string;
  tournament: { id: string; name: string } | null;
  battleId: string | null;
  stakeAmount: number;
  createdAt: Date;
  playerA: MatchPlayer;
  playerB: MatchPlayer;
  winnerId: string | null;
  /** The agreed score once decided (from the accepted report). */
  finalScore: string | null;
  viewer: {
    signedIn: boolean;
    /** "A" / "B" when the viewer is one of the players. */
    side: "A" | "B" | null;
    hasReported: boolean;
    canShareWin: boolean;
  };
  reportWindowExpiresAt: Date | null;
  dispute: { id: string } | null;
  ruling: { endpoint: string } | null;
  voidUnsupportedReason?: string;
  timeline: { at: Date; label: string }[];
};

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Head-to-head
// ---------------------------------------------------------------------------

function PlayerSide({
  player,
  data,
  side,
}: {
  player: MatchPlayer;
  data: MatchViewData;
  side: "A" | "B";
}) {
  const isWinner = data.winnerId === player.id;
  const isLoser = data.winnerId !== null && !isWinner;
  const isYou = data.viewer.side === side;
  const showReady = data.kind === "battle" && data.status === "UPCOMING";

  let state: { label: string; className: string } | null = null;
  if (isWinner) state = { label: "Winner", className: "bg-gold/15 text-gold" };
  else if (data.status === "NEEDS_RESULT" || data.status === "DISPUTED")
    state = player.reported
      ? { label: "Reported", className: "bg-success/15 text-success" }
      : { label: "Not reported", className: "bg-surface-elevated text-muted" };
  else if (showReady)
    state = player.ready
      ? { label: "Ready", className: "bg-success/15 text-success" }
      : { label: "Not ready", className: "bg-surface-elevated text-muted" };

  return (
    <div className={`flex min-w-0 flex-col items-center gap-3 text-center transition-opacity ${isLoser ? "opacity-60" : ""}`}>
      <div className="relative">
        <div
          className={`rounded-full p-[3px] ring-2 ${
            isWinner ? "ring-gold" : isYou ? "ring-accent-volt" : "ring-border-strong"
          }`}
        >
          <PlayerAvatar person={player} size="xl" />
        </div>
        {isWinner && (
          <span className="trophy-pop absolute -top-2 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-gold text-black">
            <Trophy size={14} aria-hidden />
            <span className="sr-only">Winner</span>
          </span>
        )}
      </div>
      <div className="flex min-w-0 max-w-full flex-col gap-0.5">
        <Link
          href={`/players/${player.handle}`}
          className="truncate font-display text-lg leading-tight font-bold tracking-tight uppercase transition hover:text-accent-volt sm:text-2xl"
        >
          {player.displayName}
        </Link>
        <span className="flex items-center justify-center gap-1.5 text-xs text-muted">
          <span className="truncate">@{player.handle}</span>
          {isYou && <span className="rounded-full bg-accent-volt px-1.5 py-px text-[10px] font-bold text-accent-volt-foreground">YOU</span>}
          {data.viewer.signedIn && !isYou && (
            <Link
              href={`/players/${player.handle}/report`}
              aria-label={`Report ${player.displayName}`}
              title="Report player"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition hover:bg-surface-elevated hover:text-foreground"
            >
              <Flag size={11} />
            </Link>
          )}
        </span>
        {player.standing && (
          <span className="text-stat mt-1 text-xs text-muted">
            <span className="text-gold">#{player.standing.rank}</span> · {player.standing.wins}–{player.standing.losses}
          </span>
        )}
      </div>
      <div className="flex h-6 items-center">{state && <span className={`badge ${state.className}`}>{state.label}</span>}</div>
    </div>
  );
}

function HeadToHead({ data }: { data: MatchViewData }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-hero)] border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-7">
        <div className="flex min-w-0 items-center gap-2.5">
          {data.game && <GameArtTile game={data.game} className="h-8 w-8 shrink-0 rounded-[8px]" hideLabel imgWidth={80} />}
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{data.tournament?.name ?? data.game ?? "Match"}</span>
            <span className="truncate text-xs text-muted">
              {data.tournament && data.game ? `${data.game} · ` : ""}
              {data.formatLabel}
            </span>
          </div>
        </div>
        {data.stakeAmount > 0 && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-xs font-semibold text-gold">
            <Wallet size={12} />
            {formatNaira(data.stakeAmount * 2)} pot
          </span>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 px-3 py-8 sm:gap-6 sm:px-7">
        <PlayerSide player={data.playerA} data={data} side="A" />
        <div className="flex flex-col items-center gap-1 pt-6 sm:pt-8">
          {data.finalScore ? (
            <>
              <span className="text-stat text-3xl leading-none sm:text-4xl">{data.finalScore}</span>
              <span className="text-eyebrow text-muted">Final</span>
            </>
          ) : (
            <span className="font-display text-3xl leading-none font-bold text-muted sm:text-4xl">VS</span>
          )}
        </div>
        <PlayerSide player={data.playerB} data={data} side="B" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border px-5 py-4 sm:px-7">
        <div className="flex flex-col gap-0.5">
          <span className="text-eyebrow text-muted">Match code</span>
          <CopyCode code={data.code} label="Copy match code" />
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <span className="text-eyebrow text-muted">{data.stakeAmount > 0 ? "Stake each" : "Entry"}</span>
          <span className="text-stat text-lg">{data.stakeAmount > 0 ? formatNaira(data.stakeAmount) : "Free"}</span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Progress + next step
// ---------------------------------------------------------------------------

type Step = { key: string; label: string };

function steps(data: MatchViewData): { list: Step[]; current: number; done: boolean } {
  const list: Step[] = [
    ...(data.kind === "battle" ? [{ key: "ready", label: "Ready up" }] : []),
    { key: "play", label: "Play" },
    { key: "report", label: "Report" },
    { key: "result", label: data.status === "DISPUTED" ? "Review" : "Result" },
  ];
  const index = (key: string) => list.findIndex((s) => s.key === key);
  const bothReady = data.playerA.ready && data.playerB.ready;
  if (data.status === "COMPLETE") return { list, current: list.length - 1, done: true };
  if (data.status === "DISPUTED") return { list, current: index("result"), done: false };
  if (data.status === "NEEDS_RESULT") return { list, current: index("report"), done: false };
  if (data.kind === "battle" && !bothReady) return { list, current: index("ready"), done: false };
  // UPCOMING with both ready (or a bracket match): playing, and reporting is open.
  return { list, current: index("play"), done: false };
}

function Progress({ data }: { data: MatchViewData }) {
  const { list, current, done } = steps(data);
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }} aria-label="Match progress">
      {list.map((step, i) => {
        const complete = done || i < current;
        const active = !done && i === current;
        return (
          <li key={step.key} className="flex flex-col gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={`h-1 rounded-full transition-colors duration-[var(--duration-base)] ${
                complete ? "bg-accent-volt" : active ? (data.status === "DISPUTED" ? "bg-warning" : "bg-accent-volt/50") : "bg-surface-elevated"
              }`}
            />
            <span className={`flex items-center gap-1 text-xs font-medium ${complete || active ? "text-foreground" : "text-muted"}`}>
              {complete && <Check size={12} className="text-accent-volt" strokeWidth={3} />}
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function NextStep({ data }: { data: MatchViewData }) {
  const { viewer, playerA, playerB } = data;
  const me = viewer.side === "A" ? playerA : viewer.side === "B" ? playerB : null;
  const opponent = viewer.side === "A" ? playerB : playerA;
  const bothReady = playerA.ready && playerB.ready;
  const reportingOpen =
    data.status === "NEEDS_RESULT" || (data.status === "UPCOMING" && (data.kind === "tournament" || bothReady));

  // --- Finished ---
  if (data.status === "COMPLETE") {
    const winner = data.winnerId === playerA.id ? playerA : data.winnerId === playerB.id ? playerB : null;
    if (me && winner?.id === me.id) {
      return (
        <section className="celebrate-fade flex flex-col gap-4 rounded-[var(--radius-lg)] border border-gold/30 bg-gold/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Trophy size={28} className="trophy-pop shrink-0 text-gold" aria-hidden />
            <div className="flex flex-col">
              <span className="font-display text-xl font-bold tracking-tight uppercase">Victory</span>
              <span className="text-sm text-muted">
                {data.stakeAmount > 0 ? `${formatNaira(data.stakeAmount * 2)} is in your wallet. ` : ""}This counts toward your rank.
              </span>
            </div>
          </div>
          {viewer.canShareWin && (
            <Link href={`/share/battle/${data.id}`} className="btn-secondary shrink-0">
              <Share2 size={14} />
              Share your win
            </Link>
          )}
        </section>
      );
    }
    if (me && winner) {
      return (
        <section className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col">
            <span className="font-display text-xl font-bold tracking-tight uppercase">GG</span>
            <span className="text-sm text-muted">{winner.displayName} took this one. Run it back?</span>
          </div>
          <Link href="/battles/new" className="btn-secondary shrink-0">
            New challenge
          </Link>
        </section>
      );
    }
    return (
      <section className="card text-sm text-muted">
        {winner ? `${winner.displayName} won this match.` : "This match was voided — neither side takes the win."}
      </section>
    );
  }

  // --- Disputed ---
  if (data.status === "DISPUTED") {
    return (
      <Panel title="Under review">
        <PanelBody className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            The two reports didn&apos;t match, so this result is being reviewed. You&apos;ll get a notification when it&apos;s decided.
          </p>
          {data.ruling && data.dispute && (
            <RulingForm
              bare
              disputeId={data.dispute.id}
              endpoint={data.ruling.endpoint}
              playerA={playerA}
              playerB={playerB}
              voidUnsupportedReason={data.voidUnsupportedReason}
            />
          )}
        </PanelBody>
      </Panel>
    );
  }

  // --- Spectator ---
  if (!me) {
    const line =
      data.status === "NEEDS_RESULT"
        ? "Waiting for both players to report the result."
        : data.kind === "battle" && !bothReady
          ? "Waiting for both players to ready up."
          : "The match is live.";
    return <section className="card text-sm text-muted">{line}</section>;
  }

  // --- Ready check (Challenge matches) ---
  if (data.kind === "battle" && data.status === "UPCOMING" && !bothReady) {
    if (me.ready) {
      return (
        <Panel title="You're ready">
          <PanelBody className="flex items-center gap-3">
            <Spinner size={18} className="shrink-0 text-muted" />
            <p className="text-sm text-muted">
              Waiting for <span className="font-medium text-foreground">{opponent.displayName}</span> to enter. This updates on its own.
            </p>
          </PanelBody>
        </Panel>
      );
    }
    return (
      <Panel title="Ready up">
        <PanelBody className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            You&apos;re matched with <span className="font-medium text-foreground">{opponent.displayName}</span>. Enter when you&apos;re
            ready to play — the match goes live once you&apos;re both in.
          </p>
          <EnterMatchButton matchId={data.id} />
        </PanelBody>
      </Panel>
    );
  }

  // --- Reported, waiting on the other side ---
  if (viewer.hasReported) {
    return (
      <Panel title="Result reported">
        <PanelBody className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            Waiting for {opponent.displayName} to report. If they don&apos;t, your result is accepted automatically.
          </p>
          {data.reportWindowExpiresAt && (
            <p className="flex items-center gap-1.5 text-sm">
              <Timer size={14} className="text-muted" />
              Auto-resolves in{" "}
              <span className="text-stat">
                <CountdownTimer target={data.reportWindowExpiresAt.toISOString()} zeroLabel="momentarily" />
              </span>
            </p>
          )}
        </PanelBody>
      </Panel>
    );
  }

  // --- Play + report ---
  if (reportingOpen) {
    return (
      <Panel title={data.status === "NEEDS_RESULT" ? "Report your result" : "Match live"}>
        <PanelBody className="flex flex-col gap-5">
          {data.status !== "NEEDS_RESULT" && (
            <ol className="flex flex-col gap-2 text-sm text-muted">
              <li>
                <span className="text-stat mr-2 text-foreground">1</span>Play your {data.formatLabel.toLowerCase()} against {opponent.displayName}.
              </li>
              <li>
                <span className="text-stat mr-2 text-foreground">2</span>Screenshot the final score with code{" "}
                <span className="font-mono font-semibold text-foreground">{data.code}</span> visible.
              </li>
              <li>
                <span className="text-stat mr-2 text-foreground">3</span>Report it below.
              </li>
            </ol>
          )}
          <ResultForm matchId={data.id} matchCode={data.code} playerA={playerA} playerB={playerB} />
        </PanelBody>
      </Panel>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function MatchView({ data }: { data: MatchViewData }) {
  const backHref = data.tournament ? `/tournaments/${data.tournament.id}/bracket` : data.battleId ? `/battles/${data.battleId}` : "/battles";
  const backLabel = data.tournament ? "Bracket" : "Challenge";
  const proofs = [data.playerA, data.playerB].filter((p) => p.proofUrl);
  const timeline = [...data.timeline].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div data-surface="dark" className="dark-page w-full flex-1 bg-background">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
        <div className="flex items-center justify-between gap-3">
          <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-foreground">
            <ArrowLeft size={15} />
            {backLabel}
          </Link>
          <StatusPill tone={data.statusPill.tone} pulse={data.statusPill.pulse}>
            {data.statusPill.label}
          </StatusPill>
        </div>

        <HeadToHead data={data} />
        <Progress data={data} />
        <NextStep data={data} />

        {proofs.length > 0 && (
          <Panel title="Evidence" meta={proofs.length}>
            <PanelRows>
              {proofs.map((p) => (
                <a key={p.id} href={p.proofUrl!} target="_blank" rel="noreferrer" className={panelRowClass}>
                  <PlayerAvatar person={p} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.displayName}&apos;s proof</span>
                  <span className="text-xs font-medium text-accent-blue">Open ↗</span>
                </a>
              ))}
            </PanelRows>
          </Panel>
        )}

        <Panel title="Activity">
          <ol className="flex flex-col border-t border-border px-5 py-4">
            {timeline.map((event, i) => (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {i < timeline.length - 1 && <span aria-hidden className="absolute top-3 bottom-0 left-[3px] w-px bg-border" />}
                <span
                  aria-hidden
                  className={`relative mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full ${i === 0 ? "bg-accent-volt" : "bg-border-strong"}`}
                />
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm">{event.label}</span>
                  <span className="text-metadata shrink-0">{formatTimestamp(event.at)}</span>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
