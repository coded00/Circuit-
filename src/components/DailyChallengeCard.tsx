import Link from "next/link";
import { Video } from "lucide-react";
import type { ChallengeCadence, ChallengeKind, DailyChallengeStatus, ScoreDirection } from "@prisma/client";
import { GameArtTile } from "@/components/GameArtTile";
import { StatusPill } from "@/components/StatusPill";
import { cardTimeLine, formatNaira, playerStage, prizeSummary } from "@/lib/dailyChallengeView";

export type DailyChallengeCardData = {
  id: string;
  title: string;
  gameName: string;
  status: DailyChallengeStatus;
  pausedAt: Date | null;
  entryFee: number;
  platformFeeBps: number;
  minEntrants: number;
  maxEntrants: number;
  entryOpensAt: Date;
  entryClosesAt: Date;
  windowStartsAt: Date;
  windowEndsAt: Date;
  submissionsCloseAt: Date;
  entered: number;
  sponsorKobo: number;
  kind: ChallengeKind;
  weaponLabel: string | null;
  metricLabel: string;
  direction: ScoreDirection;
  /** The challenge asks for a screen recording (a weapon or headshot stat can't be read off a scoreboard). */
  requireRecording: boolean;
  /** Fixed prizes added up, for a challenge that pays by prize categories; null for the older rank split. */
  categoryPrizeTotal: number | null;
  cadence: ChallengeCadence;
  /** The viewer's own entry, if any. */
  mine?: boolean;
};

const KIND_LABEL: Record<ChallengeKind, string> = { STANDARD: "Daily", WEAPON: "Weapon", SKILL: "Skill", COMBINED: "Combined" };

/** The objective in a phrase: "Most AK-47 kills", "Lowest time". */
export function objectiveText(c: Pick<DailyChallengeCardData, "metricLabel" | "direction">): string {
  return `${c.direction === "HIGHER" ? "Most" : "Lowest"} ${c.metricLabel.toLowerCase()}`;
}

/**
 * One Daily Challenge on the board and the homepage. One job per area, top to bottom: the art says which game and what
 * kind (and whether it's live); the title and objective say what to do; three figures say what's at stake — the prize, the
 * entry and how full it is; and one line says when. Everything else (the rules, the evidence, the requirements) is on the
 * challenge's own page, not here.
 */
export function DailyChallengeCard({ c, now }: { c: DailyChallengeCardData; now: Date }) {
  const stage = playerStage(c, now);
  const prize = prizeSummary(c);
  const fill = c.maxEntrants > 0 ? Math.min(100, (c.entered / c.maxEntrants) * 100) : 0;
  const ended = c.status === "COMPLETED" || c.status === "CANCELLED";
  const short = !ended && c.entered < c.minEntrants && (c.status === "SCHEDULED" || c.status === "OPEN");
  const timeLine = cardTimeLine(c, now);

  return (
    <Link
      href={`/battles/${c.id}`}
      className={`group relative isolate flex h-full w-full flex-col overflow-hidden cut-lg border border-border bg-black text-white transition hover:border-border-strong ${ended ? "opacity-85" : ""}`}
    >
      <div className="relative aspect-[16/7] w-full shrink-0 overflow-hidden bg-black">
        <div aria-hidden className="absolute inset-0 transition-transform duration-[var(--duration-reveal)] group-hover:scale-[1.04]">
          <GameArtTile game={c.gameName} className={`h-full w-full ${ended ? "ended-art" : ""}`} hideLabel imgWidth={640} fill />
        </div>
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent" />
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <span className="max-w-[65%] truncate bg-black/65 px-2 py-1 text-[11px] font-semibold tracking-wide uppercase backdrop-blur-sm">
            {KIND_LABEL[c.kind]}
            {c.weaponLabel ? ` · ${c.weaponLabel}` : ""}
          </span>
          <StatusPill tone={stage.tone} pulse={stage.pulse} solid>
            {stage.label}
          </StatusPill>
        </div>
        <div className="absolute inset-x-3 bottom-2 flex items-center justify-between gap-2 text-[11px] text-white/85">
          <span className="truncate">{c.gameName}</span>
          {c.requireRecording && (
            <span className="inline-flex shrink-0 items-center gap-1" title="Checked from a screen recording">
              <Video size={12} aria-hidden /> Recording
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <h3 className="line-clamp-2 font-display text-lg leading-[1.1] font-bold tracking-tight uppercase">{c.title}</h3>
          <p className="text-[13px] text-white/65">{objectiveText(c)}</p>
        </div>

        <dl className="grid grid-cols-[1.35fr_1fr_1fr] gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="truncate text-[10px] font-medium tracking-wide text-white/50 uppercase">{prize.label}</dt>
            <dd className="font-display text-xl leading-none font-bold text-gold">{prize.kobo === null ? "Glory" : formatNaira(prize.kobo)}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[10px] font-medium tracking-wide text-white/50 uppercase">Entry</dt>
            <dd className="font-display text-xl leading-none font-bold">{c.entryFee === 0 ? "Free" : formatNaira(c.entryFee)}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[10px] font-medium tracking-wide text-white/50 uppercase">Players</dt>
            <dd className="font-display text-xl leading-none font-bold tabular-nums">
              {c.entered}
              <span className="text-sm font-semibold text-white/50">/{c.maxEntrants}</span>
            </dd>
          </div>
        </dl>

        <div className="mt-auto flex flex-col gap-2">
          <div className="h-1 w-full overflow-hidden bg-white/10" role="progressbar" aria-label="Players entered" aria-valuemin={0} aria-valuemax={c.maxEntrants} aria-valuenow={c.entered}>
            <div className="h-full bg-accent-volt" style={{ width: `${fill}%` }} />
          </div>
          <div className="flex items-center justify-between gap-3 text-[12px] text-white/65">
            <span className="min-w-0 truncate">{timeLine}</span>
            {c.mine ? <span className="shrink-0 font-medium text-accent-volt">You&apos;re in</span> : short ? <span className="shrink-0">Needs {c.minEntrants} to run</span> : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
