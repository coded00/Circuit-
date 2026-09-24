"use client";

/**
 * Circuit — the "Bracket" tab's actual round-by-round grid, split out of
 * `BracketView` into its own client component for one reason: crowded
 * rounds need per-round expand/collapse state.
 *
 * The problem this solves: a 128-player bracket has 64 Round-1 matches.
 * Stacked at their real size that's ~8,000px of column height, so
 * `BracketCanvas`'s "fit the whole thing on screen" math had no choice
 * but to scale everything down to ~5% — technically nothing needs
 * scrolling, but nothing is readable either. Every real bracket product
 * (Challonge, Toornament, FACEIT, ...) solves this the same way: collapse
 * the crowded early rounds into a small summary by default, and keep the
 * rounds that matter for at-a-glance viewing — quarters, semis, final —
 * fully expanded and legible. Collapsing Round 1-3 of a 128-bracket drops
 * the tallest column from ~8,000px to whatever the largest *expanded*
 * round is (Round of 16 → ~1,000px), which is what actually lets "fit to
 * screen" land at a readable scale instead of a illegible smear.
 *
 * Any round can still be expanded on demand — nothing is hidden
 * permanently, just deferred behind one click for the rounds where
 * showing every match at once was never going to be readable anyway.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Trophy } from "lucide-react";
import { BracketSlotSide } from "./BracketSlotSide";
import { BracketCanvas } from "./BracketCanvas";
import { roundName, type BracketSlot, type BracketStructure, type Player } from "./BracketView";

/** Rounds with more matches than this start collapsed. 8 keeps Round of
 *  16 (and everything after — quarters/semis/final) expanded by default
 *  for any bracket size, while Round 1-3 of a 64/128-player bracket (32,
 *  16... wait: 64/32/16/8 for a 128-bracket) collapse — a small
 *  tournament (≤16 players) never has a round this big, so this changes
 *  nothing for the common case. */
const COLLAPSE_THRESHOLD = 8;

function chunkPairs<T>(items: T[]): T[][] {
  const pairs: T[][] = [];
  for (let i = 0; i < items.length; i += 2) pairs.push(items.slice(i, i + 2));
  return pairs;
}

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
  matchHrefBase,
  staggerIndex,
}: {
  slot: BracketSlot;
  userMap: Map<string, Player>;
  hasNextRound: boolean;
  matchHrefBase: string;
  staggerIndex: number;
}) {
  return (
    <div
      className="card motion-slide-up motion-stagger relative flex flex-col gap-0 overflow-hidden p-0"
      style={{ "--i": staggerIndex } as React.CSSProperties}
    >
      {[
        { id: slot.playerAId, isWinner: slot.winnerId === slot.playerAId },
        { id: slot.playerBId, isWinner: slot.winnerId === slot.playerBId },
      ].map((p, i) => {
        const player = p.id ? (userMap.get(p.id) ?? null) : null;
        return (
          <BracketSlotSide
            key={i}
            player={player}
            isWinner={p.isWinner}
            borderClass={i === 0 ? "border-b border-border" : ""}
          />
        );
      })}
      {slot.matchId && (
        <Link
          href={`${matchHrefBase}/${slot.matchId}`}
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

function CollapsedRound({ matchCount, decidedCount, onExpand }: { matchCount: number; decidedCount: number; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="card card-hover flex flex-1 flex-col items-center justify-center gap-1.5 p-6 text-center"
    >
      <Trophy size={18} className="text-muted" />
      <span className="font-display text-3xl leading-none font-bold tracking-tight">{matchCount}</span>
      <span className="text-xs text-muted">Match{matchCount === 1 ? "" : "es"}</span>
      <span className="text-metadata mt-1">
        {decidedCount}/{matchCount} decided
      </span>
      <span className="mt-2 flex items-center gap-1 text-xs font-medium text-accent-blue">
        <ChevronRight size={12} />
        Show matches
      </span>
    </button>
  );
}

export function BracketRounds({
  structure,
  users,
  matchHrefBase,
}: {
  structure: BracketStructure;
  users: Player[];
  matchHrefBase: string;
}) {
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    for (const round of structure.rounds) initial[round.round] = round.slots.length <= COLLAPSE_THRESHOLD;
    return initial;
  });

  return (
    <BracketCanvas>
      <div className="flex min-w-max items-stretch gap-6">
        {structure.rounds.map((round) => {
          const isLast = round.round === structure.totalRounds;
          const isCrowded = round.slots.length > COLLAPSE_THRESHOLD;
          const isExpanded = expanded[round.round];
          const decidedCount = round.slots.filter((s) => s.winnerId).length;

          return (
            <div key={round.round} className="flex w-60 shrink-0 flex-col gap-4">
              <div className="flex items-center justify-center gap-1.5">
                <h2 className="text-eyebrow text-center">{roundName(round.round, structure.totalRounds)}</h2>
                {isCrowded && isExpanded && (
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [round.round]: false }))}
                    className="text-muted transition hover:text-foreground"
                    aria-label="Collapse round"
                    title="Collapse round"
                  >
                    <ChevronDown size={14} />
                  </button>
                )}
              </div>
              {isCrowded && !isExpanded ? (
                <div className="flex flex-1 flex-col justify-center">
                  <CollapsedRound
                    matchCount={round.slots.length}
                    decidedCount={decidedCount}
                    onExpand={() => setExpanded((prev) => ({ ...prev, [round.round]: true }))}
                  />
                </div>
              ) : (
                <div className="flex flex-1 flex-col justify-around gap-6">
                  {chunkPairs(round.slots).map((pair, pairIndex) => (
                    <div key={pairIndex} className="relative flex flex-col gap-6">
                      {pair.map((slot, slotIndex) => (
                        <MatchCard
                          key={slot.position}
                          slot={slot}
                          userMap={userMap}
                          hasNextRound={!isLast}
                          matchHrefBase={matchHrefBase}
                          staggerIndex={pairIndex * 2 + slotIndex}
                        />
                      ))}
                      {pair.length === 2 && <BracketConnector hasNextRound={!isLast} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </BracketCanvas>
  );
}
