/**
 * Circuit — the Match/Bracket/Dispute engine (Build Plan P3-1 through P3-8).
 *
 * Build note from the Build Plan itself: P3-1..P3-8 is "the engine."
 * Battles (Phase 4) is a second front door onto these exact same Match and
 * Dispute entities, with tournamentId left null — if a Battle ever needs
 * its own reporting/dispute code path, that's a sign this file wasn't
 * built generic enough. Every function here already branches on
 * `match.tournamentId` being present, not on "is this a tournament match"
 * as a separate concept. A staked Battle's escrow settlement (pay the
 * winner on complete, refund both on void) is the one genuinely
 * Battle-only piece of money-moving logic here — see
 * `settleBattleOnComplete` and `ruleDispute`'s void branch — because
 * tournaments settle money through a completely different path (prize
 * claim via `payoutMethodRef`, entry-fee refund via the payment
 * provider), not because this file forked unnecessarily.
 *
 * TRU-2's open product question (PRD §19): voiding a bracket match — free
 * or paid — has no agreed-on answer yet (replay? split the round? leave it
 * to the organizer?). Only Battles can be voided here; ruleDispute refuses
 * to void any match with a tournamentId rather than guessing. That's a
 * deliberate refusal, not a missing feature.
 */

import { Prisma } from "@prisma/client";
import type { Dispute, Match } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notify, notifyStaff } from "@/lib/notifications";
import { expireOpenBattles } from "@/lib/battles";
import { proofStorage } from "@/lib/storage";
import { settleOrganizerRevenue } from "@/lib/settlement";
import { autoApprovePayouts } from "@/lib/payoutApproval";
import { trackEvent } from "@/lib/analytics";
import { captureException } from "@/lib/observability";
import { logAdminAction } from "@/lib/auditLog";
import { sweepQuickMatchChallenges } from "@/lib/quickMatch";
import { detectStakePatterns } from "@/lib/stakePatterns";
import { startLobby } from "@/lib/lobby";
import { buildRoundRobinTable, roundRobinOutcome, roundRobinSchedule } from "@/lib/roundRobin";
import {
  buildDoubleElim,
  isDoubleElimStructure,
  nodeByMatch,
  nodeMatchRound,
  recordDoubleElimResult,
  resolveDoubleElim,
  setNodeMatch,
  type DEStructure,
} from "@/lib/doubleElim";
import { isRoundRobinStructure, isSwissStructure, toRRMatch, type RoundRobinStructure, type SwissStructure } from "@/lib/roundRobinStandings";
import { buildSwissTable, pairSwissRound, swissOutcome, swissRoundsFor } from "@/lib/swiss";
import { buildLeagueTable, DEFAULT_MATCHDAY_DAYS, DRAW_RESULT, leagueOutcome, leagueSchedule, matchdayDeadlines, totalMatchdays } from "@/lib/leagueTable";
import { isLeagueStructure, leagueRulesOf, toLeagueMatch, type LeagueStructure } from "@/lib/leagueStandings";

export class MatchError extends Error {
  code:
    | "NOT_FOUND"
    | "ALREADY_COMPLETE"
    | "DISPUTED"
    | "NOT_A_PARTICIPANT"
    | "INVALID_WINNER"
    | "ALREADY_RESOLVED"
    | "NOT_ESCALATED"
    | "NOT_ORGANIZER_REVIEW"
    | "FORBIDDEN"
    | "WINDOW_EXPIRED"
    | "VOID_UNSUPPORTED"
    | "TOURNAMENT_CANCELLED"
    | "NOTHING_TO_CONFIRM";

  constructor(code: MatchError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "MatchError";
  }
}

// ---------------------------------------------------------------------------
// Bracket structure — round/seeding topology lives as JSON on Bracket.
// structure (see that model's own comment for why), not as FK columns on
// Match. A Match row for round N+1 is only created once both of its
// round-N feeder slots have a winner — Match.playerAId/playerBId are
// non-nullable, so a "TBD" opponent literally can't be represented as a row.
// ---------------------------------------------------------------------------

type BracketSlot = {
  position: number;
  matchId: string | null;
  playerAId: string | null;
  playerBId: string | null;
  winnerId: string | null;
};

type BracketRound = {
  round: number;
  slots: BracketSlot[];
};

type BracketStructure = {
  bracketSize: number;
  totalRounds: number;
  rounds: BracketRound[];
};

export type ResultPayload = {
  winnerId: string;
  score: string;
  submittedAt: string;
  /** Self-reported by whichever side submitted this result — same trust
   *  model as `score` (the proof screenshot is the real backstop, this is
   *  supplementary flavor data for the "Top Fragger" share-card award,
   *  not money-related). Optional: most games don't have a meaningful
   *  per-match kill count (e.g. EA FC, Rocket League), so this is never
   *  required. */
  kills?: number;
  /** Set when the organizer awarded this result (an unplayed league fixture) instead of a player reporting it. */
  awarded?: boolean;
  /** Set when this side didn't report their own result but confirmed the opponent's (no separate proof). */
  confirmed?: boolean;
};

const AUTO_ACCEPT_WINDOW_MS = 2 * 60 * 60 * 1000; // BRK-10, 2h placeholder
const ORGANIZER_RULING_WINDOW_MS = 24 * 60 * 60 * 1000; // BRK-5, 24h placeholder
const MATCH_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — proof photos misread easily

function generateMatchCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += MATCH_CODE_CHARS[Math.floor(Math.random() * MATCH_CODE_CHARS.length)];
  }
  return code;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

function normalizeScore(score: string): string {
  return score.trim().toLowerCase().replace(/\s+/g, "");
}

type Db = typeof prisma | Prisma.TransactionClient;

async function createMatchWithUniqueCode(
  data: {
    tournamentId?: string;
    battleId?: string;
    round?: number;
    playerAId: string;
    playerBId: string;
  },
  db: Db = prisma
): Promise<Match> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.match.create({
        data: { ...data, matchCode: generateMatchCode(), status: "UPCOMING" },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // A collision on `battleId` is not the matchCode collision this retry exists for, and no
        // retry can fix it: Match.battleId is unique, so a P2002 there means this Battle already has
        // a Match — which is exactly the state a double pot payout comes from. Surface that reason
        // instead of burning two more attempts and reporting a misleading "could not generate a
        // unique match code" (stringified because the driver reports the target as an array).
        if (data.battleId && String(err.meta?.target ?? "").includes("battleId")) throw err;
        continue;
      }
      throw err;
    }
  }
  throw new Error("Could not generate a unique match code after 3 attempts.");
}

// ---------------------------------------------------------------------------
// P3-2/P3-3: bracket generation, random seeding, byes, match codes.
// ---------------------------------------------------------------------------

/**
 * Idempotent — safe to call from both the cap-fill path (inline in the
 * registrations route) and the deadline-sweep path without double-generating.
 */
export async function generateBracket(tournamentId: string): Promise<void> {
  // Lobby tournaments have rounds instead of a bracket (src/lib/lobby.ts);
  // round robins have every pairing up front.
  const kind = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { competitionStyle: true, format: true } });
  if (kind?.competitionStyle === "LOBBY") return startLobby(tournamentId);
  if (kind?.format === "ROUND_ROBIN") return generateRoundRobin(tournamentId);
  if (kind?.format === "LEAGUE") return generateLeague(tournamentId);
  if (kind?.format === "DOUBLE_ELIMINATION") return generateDoubleElim(tournamentId);
  if (kind?.format === "SWISS") return generateSwiss(tournamentId);

  const existing = await prisma.bracket.findUnique({ where: { tournamentId } });
  if (existing) return;

  const confirmed = await prisma.registration.findMany({
    where: { tournamentId, status: "CONFIRMED" },
    select: { userId: true },
  });
  if (confirmed.length < 2) return; // nothing to bracket yet

  const bracketSize = nextPowerOfTwo(confirmed.length);
  const totalRounds = Math.log2(bracketSize);
  const seeded: (string | null)[] = shuffle(confirmed.map((r) => r.userId));
  while (seeded.length < bracketSize) seeded.push(null); // byes

  const structure: BracketStructure = {
    bracketSize,
    totalRounds,
    rounds: Array.from({ length: totalRounds }, (_, i) => {
      const round = i + 1;
      const slotCount = bracketSize / 2 ** round;
      return {
        round,
        slots: Array.from({ length: slotCount }, (_, position) => ({
          position,
          matchId: null,
          playerAId: null,
          playerBId: null,
          winnerId: null,
        })),
      };
    }),
  };

  // Round 1: create real matches for full pairs, record byes as immediate
  // winners (no Match row — playerAId/playerBId can't be null).
  const round1 = structure.rounds[0];
  const byeAdvances: { position: number; winnerId: string }[] = [];
  const createdMatches: { id: string; playerAId: string; playerBId: string }[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      // Re-check existence inside transaction to prevent duplicate work
      const alreadyExists = await tx.bracket.findUnique({ where: { tournamentId } });
      if (alreadyExists) return;

      for (let position = 0; position < round1.slots.length; position++) {
        const playerA = seeded[position * 2];
        const playerB = seeded[position * 2 + 1];
        const slot = round1.slots[position];
        slot.playerAId = playerA;
        slot.playerBId = playerB;

        if (playerA && playerB) {
          const match = await createMatchWithUniqueCode(
            {
              tournamentId,
              round: 1,
              playerAId: playerA,
              playerBId: playerB,
            },
            tx
          );
          slot.matchId = match.id;
          createdMatches.push({ id: match.id, playerAId: playerA, playerBId: playerB });
        } else {
          const byeWinner = playerA ?? playerB;
          if (byeWinner) {
            slot.winnerId = byeWinner;
            byeAdvances.push({ position, winnerId: byeWinner });
          }
        }
      }

      // Propagate byes into round 2+ in-memory, creating round-2+ matches inside the same transaction
      for (const { position, winnerId } of byeAdvances) {
        const readyMatch = recordWinner(structure, 1, position, winnerId);
        if (readyMatch) {
          const match = await createMatchWithUniqueCode(
            {
              tournamentId,
              round: readyMatch.round,
              playerAId: readyMatch.playerAId,
              playerBId: readyMatch.playerBId,
            },
            tx
          );
          setSlotMatchId(structure, readyMatch.round, readyMatch.position, match.id);
          createdMatches.push({ id: match.id, playerAId: readyMatch.playerAId, playerBId: readyMatch.playerBId });
        }
      }

      await tx.bracket.create({
        data: { tournamentId, structure: structure as unknown as Prisma.InputJsonValue },
      });
      await tx.tournament.update({ where: { id: tournamentId }, data: { status: "LIVE" } });
    });
  } catch (err) {
    // If a concurrent call created the bracket in parallel, P2002 rolls back the entire
    // transaction cleanly, ensuring zero orphaned matches are left in the database.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }

  // Only notify once the transaction committed successfully
  if (createdMatches.length > 0) {
    await Promise.all(
      createdMatches.flatMap((match) => [
        notify(match.playerAId, "MATCH_READY", { matchId: match.id }),
        notify(match.playerBId, "MATCH_READY", { matchId: match.id }),
      ])
    );
  }
}

/** Records a winner into its slot and propagates into the next round's
 *  feeder slot. Returns the next match's players once both are known and
 *  it doesn't exist yet — the caller creates that Match row and calls
 *  setSlotMatchId to record it back onto the structure. Mutates in place;
 *  the caller is responsible for persisting `structure`. */
function recordWinner(
  structure: BracketStructure,
  round: number,
  position: number,
  winnerId: string
): { round: number; position: number; playerAId: string; playerBId: string } | null {
  const roundData = structure.rounds.find((r) => r.round === round);
  const slot = roundData?.slots[position];
  if (slot) slot.winnerId = winnerId;

  if (round === structure.totalRounds) return null; // champion — nothing to advance into

  const nextRound = round + 1;
  const nextPosition = Math.floor(position / 2);
  const isPlayerA = position % 2 === 0;
  const nextRoundData = structure.rounds.find((r) => r.round === nextRound);
  const nextSlot = nextRoundData?.slots[nextPosition];
  if (!nextSlot) return null;

  if (isPlayerA) nextSlot.playerAId = winnerId;
  else nextSlot.playerBId = winnerId;

  if (nextSlot.playerAId && nextSlot.playerBId && !nextSlot.matchId) {
    return {
      round: nextRound,
      position: nextPosition,
      playerAId: nextSlot.playerAId,
      playerBId: nextSlot.playerBId,
    };
  }
  return null;
}

function setSlotMatchId(structure: BracketStructure, round: number, position: number, matchId: string): void {
  const slot = structure.rounds.find((r) => r.round === round)?.slots[position];
  if (slot) slot.matchId = matchId;
}

function findSlotByMatchId(structure: BracketStructure, matchId: string): { round: number; position: number } | null {
  for (const roundData of structure.rounds) {
    for (const slot of roundData.slots) {
      if (slot.matchId === matchId) return { round: roundData.round, position: slot.position };
    }
  }
  return null;
}

const ADVANCEMENT_MAX_RETRIES = 3;

/** Advances a completed bracket match's winner into the next round,
 *  creating that round's Match once both its feeders are known, and
 *  flips the Tournament to COMPLETE once the final round's winner lands.
 *  A Battle match (no tournamentId) has no bracket to advance — no-op.
 *
 *  Wrapped in a serializable transaction with retry: this is a
 *  read-modify-write on one Bracket row's JSON, and two round-1 matches
 *  finishing around the same moment (an ordinary occurrence in a live
 *  tournament, not an edge case) would otherwise race — the second write
 *  silently clobbering the first's advancement and losing a winner. */
async function applyWinnerAdvancement(tournamentId: string, matchId: string, winnerId: string): Promise<void> {
  for (let attempt = 0; attempt < ADVANCEMENT_MAX_RETRIES; attempt++) {
    let createdMatch: { id: string; playerAId: string; playerBId: string } | null = null;
    let completedTournament: { organizerId: string } | null = null;

    try {
      await prisma.$transaction(
        async (tx) => {
          const bracket = await tx.bracket.findUnique({ where: { tournamentId } });
          if (!bracket) return;

          const structure = bracket.structure as unknown as BracketStructure;
          const location = findSlotByMatchId(structure, matchId);
          if (!location) return;

          const isFinal = location.round === structure.totalRounds;
          const readyMatch = recordWinner(structure, location.round, location.position, winnerId);

          if (readyMatch) {
            const match = await createMatchWithUniqueCode(
              {
                tournamentId,
                round: readyMatch.round,
                playerAId: readyMatch.playerAId,
                playerBId: readyMatch.playerBId,
              },
              tx
            );
            setSlotMatchId(structure, readyMatch.round, readyMatch.position, match.id);
            createdMatch = { id: match.id, playerAId: readyMatch.playerAId, playerBId: readyMatch.playerBId };
          }

          await tx.bracket.update({
            where: { id: bracket.id },
            data: { structure: structure as unknown as Prisma.InputJsonValue },
          });
          if (isFinal) {
            completedTournament = await tx.tournament.update({
              where: { id: tournamentId },
              data: { status: "COMPLETE", completedAt: new Date() },
              select: { organizerId: true },
            });
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      // Only notify once the transaction actually committed.
      if (createdMatch) {
        const match: { id: string; playerAId: string; playerBId: string } = createdMatch;
        await Promise.all([
          notify(match.playerAId, "MATCH_READY", { matchId: match.id }),
          notify(match.playerBId, "MATCH_READY", { matchId: match.id }),
        ]);
      }
      if (completedTournament) {
        const tournament: { organizerId: string } = completedTournament;
        await Promise.all([
          notify(winnerId, "TOURNAMENT_COMPLETE", { tournamentId, isOrganizer: false }),
          notify(tournament.organizerId, "TOURNAMENT_COMPLETE", { tournamentId, isOrganizer: true }),
        ]);
      }
      return;
    } catch (err) {
      const isSerializationFailure =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (isSerializationFailure && attempt < ADVANCEMENT_MAX_RETRIES - 1) continue;
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Round robin (src/lib/roundRobin.ts): every pairing is created at the
// start; the tournament completes when the last match does, via a decider
// match if first place is tied on every tiebreak.
// ---------------------------------------------------------------------------

async function generateRoundRobin(tournamentId: string): Promise<void> {
  const existing = await prisma.bracket.findUnique({ where: { tournamentId } });
  if (existing) return;
  const [tournament, confirmed] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true } }),
    prisma.registration.findMany({ where: { tournamentId, status: "CONFIRMED" }, select: { userId: true } }),
  ]);
  if (!tournament || confirmed.length < 2) return;
  const ids = shuffle(confirmed.map((r) => r.userId));
  const schedule = roundRobinSchedule(ids);
  const structure: RoundRobinStructure = { type: "ROUND_ROBIN", totalRounds: schedule.length };
  try {
    await prisma.$transaction(
      async (tx) => {
        // Created first: the unique tournamentId makes a concurrent second call fail here, before any match exists.
        await tx.bracket.create({ data: { tournamentId, structure: structure as unknown as Prisma.InputJsonValue } });
        for (const round of schedule) {
          for (const [playerAId, playerBId] of round.pairs) {
            await createMatchWithUniqueCode({ tournamentId, round: round.round, playerAId, playerBId }, tx);
          }
        }
        await tx.tournament.update({ where: { id: tournamentId }, data: { status: "LIVE" } });
      },
      { timeout: 30_000 }
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
  await Promise.all(
    ids.map((userId) =>
      notify(userId, "ROUND_ROBIN_STARTED", { tournamentId, tournamentName: tournament.name, matches: String(ids.length - 1) })
    )
  );
}

/** After a round robin match completes: create the decider if first is tied, or complete the tournament. */
async function advanceRoundRobin(tournamentId: string): Promise<void> {
  for (let attempt = 0; attempt < ADVANCEMENT_MAX_RETRIES; attempt++) {
    let decider: { id: string; playerAId: string; playerBId: string } | null = null;
    let completed: { organizerId: string; winnerId: string } | null = null;
    try {
      await prisma.$transaction(
        async (tx) => {
          const [bracket, tournament, regs, rows] = await Promise.all([
            tx.bracket.findUnique({ where: { tournamentId } }),
            tx.tournament.findUnique({ where: { id: tournamentId }, select: { status: true, organizerId: true } }),
            tx.registration.findMany({ where: { tournamentId, status: "CONFIRMED" }, select: { userId: true } }),
            tx.match.findMany({ where: { tournamentId } }),
          ]);
          if (!bracket || !isRoundRobinStructure(bracket.structure) || tournament?.status !== "LIVE") return;
          const total = bracket.structure.totalRounds;
          const all = rows.map(toRRMatch);
          const regular = all.filter((m) => (m.round ?? 0) <= total);
          const existingDecider = all.find((m) => (m.round ?? 0) > total) ?? null;
          const outcome = roundRobinOutcome(buildRoundRobinTable(regs.map((r) => r.userId), regular), regular, existingDecider);
          if (outcome.state === "NEEDS_DECIDER") {
            const [playerAId, playerBId] = outcome.between;
            const match = await createMatchWithUniqueCode({ tournamentId, round: total + 1, playerAId, playerBId }, tx);
            decider = { id: match.id, playerAId, playerBId };
          } else if (outcome.state === "DECIDED") {
            await tx.tournament.update({ where: { id: tournamentId }, data: { status: "COMPLETE", completedAt: new Date() } });
            completed = { organizerId: tournament.organizerId, winnerId: outcome.winnerId };
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      if (decider) {
        const d: { id: string; playerAId: string; playerBId: string } = decider;
        await Promise.all([notify(d.playerAId, "MATCH_READY", { matchId: d.id }), notify(d.playerBId, "MATCH_READY", { matchId: d.id })]);
      }
      if (completed) {
        const c: { organizerId: string; winnerId: string } = completed;
        await Promise.all([
          notify(c.winnerId, "TOURNAMENT_COMPLETE", { tournamentId, isOrganizer: false }),
          notify(c.organizerId, "TOURNAMENT_COMPLETE", { tournamentId, isOrganizer: true }),
        ]);
      }
      return;
    } catch (err) {
      const isSerializationFailure = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (isSerializationFailure && attempt < ADVANCEMENT_MAX_RETRIES - 1) continue;
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// League (src/lib/leagueTable.ts): every pairing is created up front, grouped
// into matchdays with a play-by date. Matches can end level when the organizer
// allows draws; the table (points, head-to-head, goal difference) decides, and
// a decider settles a dead tie for first.
// ---------------------------------------------------------------------------

async function generateLeague(tournamentId: string): Promise<void> {
  const existing = await prisma.bracket.findUnique({ where: { tournamentId } });
  if (existing) return;
  const [tournament, confirmed] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true, leagueLegs: true, leagueMatchdayDays: true } }),
    prisma.registration.findMany({ where: { tournamentId, status: "CONFIRMED" }, select: { userId: true } }),
  ]);
  if (!tournament || confirmed.length < 2) return;
  const legs = tournament.leagueLegs === 2 ? 2 : 1;
  const ids = shuffle(confirmed.map((r) => r.userId));
  const schedule = leagueSchedule(ids, legs);
  const startedAt = new Date();
  const structure: LeagueStructure = {
    type: "LEAGUE",
    totalRounds: totalMatchdays(ids.length, legs),
    legs,
    startedAt: startedAt.toISOString(),
    deadlines: matchdayDeadlines(totalMatchdays(ids.length, legs), startedAt.getTime(), tournament.leagueMatchdayDays ?? DEFAULT_MATCHDAY_DAYS),
  };
  try {
    await prisma.$transaction(
      async (tx) => {
        // Created first: the unique tournamentId makes a concurrent second call fail here, before any match exists.
        await tx.bracket.create({ data: { tournamentId, structure: structure as unknown as Prisma.InputJsonValue } });
        for (const round of schedule) {
          for (const [playerAId, playerBId] of round.pairs) {
            await createMatchWithUniqueCode({ tournamentId, round: round.round, playerAId, playerBId }, tx);
          }
        }
        await tx.tournament.update({ where: { id: tournamentId }, data: { status: "LIVE" } });
      },
      { timeout: 60_000 }
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
  await Promise.all(
    ids.map((userId) =>
      notify(userId, "LEAGUE_STARTED", {
        tournamentId,
        tournamentName: tournament.name,
        matches: String((ids.length - 1) * legs),
        firstDeadline: structure.deadlines[0],
      })
    )
  );
}

/** After a league match completes: create the decider if first is tied on everything, or complete the tournament. */
async function advanceLeague(tournamentId: string): Promise<void> {
  for (let attempt = 0; attempt < ADVANCEMENT_MAX_RETRIES; attempt++) {
    let decider: { id: string; playerAId: string; playerBId: string } | null = null;
    let completed: { organizerId: string; winnerId: string } | null = null;
    try {
      await prisma.$transaction(
        async (tx) => {
          const [bracket, tournament, regs, rows] = await Promise.all([
            tx.bracket.findUnique({ where: { tournamentId } }),
            tx.tournament.findUnique({ where: { id: tournamentId }, select: { status: true, organizerId: true, leagueWinPoints: true, leagueDrawPoints: true } }),
            tx.registration.findMany({ where: { tournamentId, status: "CONFIRMED" }, select: { userId: true } }),
            tx.match.findMany({ where: { tournamentId } }),
          ]);
          if (!bracket || !isLeagueStructure(bracket.structure) || tournament?.status !== "LIVE") return;
          const total = bracket.structure.totalRounds;
          const all = rows.map(toLeagueMatch);
          const regular = all.filter((m) => (m.round ?? 0) <= total);
          const existingDecider = all.find((m) => (m.round ?? 0) > total) ?? null;
          const table = buildLeagueTable(regs.map((r) => r.userId), regular, leagueRulesOf(tournament));
          const outcome = leagueOutcome(table, regular, existingDecider);
          if (outcome.state === "NEEDS_DECIDER") {
            const [playerAId, playerBId] = outcome.between;
            const match = await createMatchWithUniqueCode({ tournamentId, round: total + 1, playerAId, playerBId }, tx);
            decider = { id: match.id, playerAId, playerBId };
          } else if (outcome.state === "DECIDED") {
            await tx.tournament.update({ where: { id: tournamentId }, data: { status: "COMPLETE", completedAt: new Date() } });
            completed = { organizerId: tournament.organizerId, winnerId: outcome.winnerId };
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      if (decider) {
        const d: { id: string; playerAId: string; playerBId: string } = decider;
        await Promise.all([notify(d.playerAId, "MATCH_READY", { matchId: d.id }), notify(d.playerBId, "MATCH_READY", { matchId: d.id })]);
      }
      if (completed) {
        const c: { organizerId: string; winnerId: string } = completed;
        await Promise.all([
          notify(c.winnerId, "TOURNAMENT_COMPLETE", { tournamentId, isOrganizer: false }),
          notify(c.organizerId, "TOURNAMENT_COMPLETE", { tournamentId, isOrganizer: true }),
        ]);
      }
      return;
    } catch (err) {
      const isSerializationFailure = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (isSerializationFailure && attempt < ADVANCEMENT_MAX_RETRIES - 1) continue;
      throw err;
    }
  }
}

/** A match can end level only in a league that allows draws, and never in its decider. */
async function drawAllowed(match: Pick<Match, "tournamentId" | "round">): Promise<boolean> {
  if (!match.tournamentId) return false;
  const t = await prisma.tournament.findUnique({
    where: { id: match.tournamentId },
    select: { format: true, leagueDrawPoints: true, bracket: { select: { structure: true } } },
  });
  if (t?.format !== "LEAGUE" || t.leagueDrawPoints === null) return false;
  return isLeagueStructure(t.bracket?.structure) && (match.round ?? 0) <= t.bracket.structure.totalRounds;
}

// ---------------------------------------------------------------------------
// Double elimination (src/lib/doubleElim.ts): the node graph lives on the
// Bracket row; a Match is created for each node once both its players are
// known, and byes resolve on their own.
// ---------------------------------------------------------------------------

async function generateDoubleElim(tournamentId: string): Promise<void> {
  const existing = await prisma.bracket.findUnique({ where: { tournamentId } });
  if (existing) return;
  const confirmed = await prisma.registration.findMany({ where: { tournamentId, status: "CONFIRMED" }, select: { userId: true } });
  if (confirmed.length < 2) return;
  const structure = buildDoubleElim(shuffle(confirmed.map((r) => r.userId)));
  const ready = resolveDoubleElim(structure);
  const created: { id: string; playerAId: string; playerBId: string }[] = [];
  try {
    await prisma.$transaction(async (tx) => {
      const bracket = await tx.bracket.create({ data: { tournamentId, structure: {} } });
      for (const n of ready) {
        const match = await createMatchWithUniqueCode({ tournamentId, round: nodeMatchRound(n), playerAId: n.playerAId!, playerBId: n.playerBId! }, tx);
        setNodeMatch(structure, n.id, match.id);
        created.push({ id: match.id, playerAId: match.playerAId, playerBId: match.playerBId });
      }
      await tx.bracket.update({ where: { id: bracket.id }, data: { structure: structure as unknown as Prisma.InputJsonValue } });
      await tx.tournament.update({ where: { id: tournamentId }, data: { status: "LIVE" } });
    }, { timeout: 30_000 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
  await Promise.all(created.flatMap((m) => [notify(m.playerAId, "MATCH_READY", { matchId: m.id }), notify(m.playerBId, "MATCH_READY", { matchId: m.id })]));
}

/** Records a double elimination result, creates the matches it unlocks, and completes the tournament on a champion. */
async function advanceDoubleElim(tournamentId: string, matchId: string, winnerId: string): Promise<void> {
  for (let attempt = 0; attempt < ADVANCEMENT_MAX_RETRIES; attempt++) {
    const created: { id: string; playerAId: string; playerBId: string }[] = [];
    let completed: { organizerId: string; championId: string } | null = null;
    try {
      await prisma.$transaction(
        async (tx) => {
          const bracket = await tx.bracket.findUnique({ where: { tournamentId } });
          if (!bracket || !isDoubleElimStructure(bracket.structure)) return;
          const structure = bracket.structure as DEStructure;
          const ready = recordDoubleElimResult(structure, matchId, winnerId);
          for (const n of ready) {
            const match = await createMatchWithUniqueCode({ tournamentId, round: nodeMatchRound(n), playerAId: n.playerAId!, playerBId: n.playerBId! }, tx);
            setNodeMatch(structure, n.id, match.id);
            created.push({ id: match.id, playerAId: match.playerAId, playerBId: match.playerBId });
          }
          await tx.bracket.update({ where: { id: bracket.id }, data: { structure: structure as unknown as Prisma.InputJsonValue } });
          if (structure.championId) {
            const t = await tx.tournament.update({ where: { id: tournamentId }, data: { status: "COMPLETE", completedAt: new Date() }, select: { organizerId: true } });
            completed = { organizerId: t.organizerId, championId: structure.championId };
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      await Promise.all(created.flatMap((m) => [notify(m.playerAId, "MATCH_READY", { matchId: m.id }), notify(m.playerBId, "MATCH_READY", { matchId: m.id })]));
      if (completed) {
        const c: { organizerId: string; championId: string } = completed;
        await Promise.all([
          notify(c.championId, "TOURNAMENT_COMPLETE", { tournamentId, isOrganizer: false }),
          notify(c.organizerId, "TOURNAMENT_COMPLETE", { tournamentId, isOrganizer: true }),
        ]);
      }
      return;
    } catch (err) {
      const isSerializationFailure = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (isSerializationFailure && attempt < ADVANCEMENT_MAX_RETRIES - 1) continue;
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Swiss (src/lib/swiss.ts): one round at a time, drawn when the previous
// round's last match completes; a decider settles a dead tie for first.
// ---------------------------------------------------------------------------

async function generateSwiss(tournamentId: string): Promise<void> {
  const existing = await prisma.bracket.findUnique({ where: { tournamentId } });
  if (existing) return;
  const [tournament, confirmed] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true } }),
    prisma.registration.findMany({ where: { tournamentId, status: "CONFIRMED" }, select: { userId: true } }),
  ]);
  if (!tournament || confirmed.length < 2) return;
  const totalRounds = swissRoundsFor(confirmed.length);
  const { pairs, bye } = pairSwissRound(shuffle(confirmed.map((r) => r.userId)), [], []);
  const structure: SwissStructure = { type: "SWISS", totalRounds, currentRound: 1, byes: bye ? [{ round: 1, userId: bye }] : [] };
  const created: { id: string; playerAId: string; playerBId: string }[] = [];
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.bracket.create({ data: { tournamentId, structure: structure as unknown as Prisma.InputJsonValue } });
        for (const [playerAId, playerBId] of pairs) {
          const m = await createMatchWithUniqueCode({ tournamentId, round: 1, playerAId, playerBId }, tx);
          created.push({ id: m.id, playerAId, playerBId });
        }
        await tx.tournament.update({ where: { id: tournamentId }, data: { status: "LIVE" } });
      },
      { timeout: 30_000 }
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
  await notifySwissRound(tournamentId, tournament.name, 1, totalRounds, created, bye);
}

async function notifySwissRound(
  tournamentId: string,
  tournamentName: string,
  round: number,
  totalRounds: number,
  created: { id: string; playerAId: string; playerBId: string }[],
  bye: string | null
) {
  await Promise.all([
    ...created.flatMap((m) => [notify(m.playerAId, "MATCH_READY", { matchId: m.id }), notify(m.playerBId, "MATCH_READY", { matchId: m.id })]),
    ...(bye ? [notify(bye, "SWISS_BYE", { tournamentId, tournamentName, round: String(round), rounds: String(totalRounds) })] : []),
  ]);
}

/** After a Swiss match completes: draw the next round, create a decider, or complete the tournament. */
async function advanceSwiss(tournamentId: string): Promise<void> {
  for (let attempt = 0; attempt < ADVANCEMENT_MAX_RETRIES; attempt++) {
    const created: { id: string; playerAId: string; playerBId: string }[] = [];
    let drawn: { round: number; totalRounds: number; bye: string | null; name: string } | null = null;
    let completed: { organizerId: string; winnerId: string } | null = null;
    try {
      await prisma.$transaction(
        async (tx) => {
          const [bracket, tournament, regs, rows] = await Promise.all([
            tx.bracket.findUnique({ where: { tournamentId } }),
            tx.tournament.findUnique({ where: { id: tournamentId }, select: { status: true, organizerId: true, name: true } }),
            tx.registration.findMany({ where: { tournamentId, status: "CONFIRMED" }, select: { userId: true } }),
            tx.match.findMany({ where: { tournamentId } }),
          ]);
          if (!bracket || !isSwissStructure(bracket.structure) || tournament?.status !== "LIVE") return;
          const structure = bracket.structure;
          const all = rows.map(toRRMatch);
          const regular = all.filter((m) => (m.round ?? 0) <= structure.totalRounds);
          const decider = all.find((m) => (m.round ?? 0) > structure.totalRounds) ?? null;
          const table = buildSwissTable(regs.map((r) => r.userId), regular, structure.byes);
          const outcome = swissOutcome(table, regular, structure.totalRounds, structure.currentRound, decider);
          if (outcome.state === "NEXT_ROUND") {
            const { pairs, bye } = pairSwissRound(table.map((r) => r.entryId), regular, structure.byes);
            for (const [playerAId, playerBId] of pairs) {
              const m = await createMatchWithUniqueCode({ tournamentId, round: outcome.round, playerAId, playerBId }, tx);
              created.push({ id: m.id, playerAId, playerBId });
            }
            const next: SwissStructure = { ...structure, currentRound: outcome.round, byes: bye ? [...structure.byes, { round: outcome.round, userId: bye }] : structure.byes };
            await tx.bracket.update({ where: { id: bracket.id }, data: { structure: next as unknown as Prisma.InputJsonValue } });
            drawn = { round: outcome.round, totalRounds: structure.totalRounds, bye, name: tournament.name };
          } else if (outcome.state === "NEEDS_DECIDER") {
            const [playerAId, playerBId] = outcome.between;
            const m = await createMatchWithUniqueCode({ tournamentId, round: structure.totalRounds + 1, playerAId, playerBId }, tx);
            created.push({ id: m.id, playerAId, playerBId });
          } else if (outcome.state === "DECIDED") {
            await tx.tournament.update({ where: { id: tournamentId }, data: { status: "COMPLETE", completedAt: new Date() } });
            completed = { organizerId: tournament.organizerId, winnerId: outcome.winnerId };
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 }
      );
      if (drawn) {
        const d: { round: number; totalRounds: number; bye: string | null; name: string } = drawn;
        await notifySwissRound(tournamentId, d.name, d.round, d.totalRounds, created, d.bye);
      } else if (created.length) {
        await Promise.all(created.flatMap((m) => [notify(m.playerAId, "MATCH_READY", { matchId: m.id }), notify(m.playerBId, "MATCH_READY", { matchId: m.id })]));
      }
      if (completed) {
        const c: { organizerId: string; winnerId: string } = completed;
        await Promise.all([
          notify(c.winnerId, "TOURNAMENT_COMPLETE", { tournamentId, isOrganizer: false }),
          notify(c.organizerId, "TOURNAMENT_COMPLETE", { tournamentId, isOrganizer: true }),
        ]);
      }
      return;
    } catch (err) {
      const isSerializationFailure = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (isSerializationFailure && attempt < ADVANCEMENT_MAX_RETRIES - 1) continue;
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// P3-4/P3-5/P3-7: result submission, auto-complete, dispute creation.
// ---------------------------------------------------------------------------

export type SubmitResultInput = {
  matchId: string;
  submittingUserId: string;
  winnerId: string;
  score: string;
  kills?: number;
  proofBuffer: Buffer;
  proofContentType: string;
};

export type SubmitResultOutcome = "RECORDED" | "AUTO_COMPLETED" | "DISPUTED";

/**
 * BRK-3's "must show the match code" isn't OCR-checked in V1 (the PRD
 * frames automated proof screening as fast-follow backlog, not launch
 * scope) — the code is real and unique per match, but binding a specific
 * proof file to it is a human-review-time check (organizer/staff, if a
 * dispute reaches them), not something this function verifies.
 */
export async function submitResult(input: SubmitResultInput): Promise<{ match: Match; outcome: SubmitResultOutcome }> {
  const match = await prisma.match.findUnique({
    where: { id: input.matchId },
    include: { tournament: { select: { status: true } } },
  });
  if (!match) throw new MatchError("NOT_FOUND", "Match not found.");
  if (match.tournament?.status === "CANCELLED") {
    throw new MatchError("TOURNAMENT_CANCELLED", "This tournament was cancelled. No results can be submitted.");
  }
  if (match.status === "COMPLETE") {
    throw new MatchError("ALREADY_COMPLETE", "This match is already complete.");
  }
  if (match.status === "DISPUTED") {
    throw new MatchError("DISPUTED", "This match is under dispute review.");
  }
  if (input.submittingUserId !== match.playerAId && input.submittingUserId !== match.playerBId) {
    throw new MatchError("NOT_A_PARTICIPANT", "Only the two players in this match can submit a result.");
  }
  if (input.winnerId === DRAW_RESULT) {
    if (!(await drawAllowed(match))) throw new MatchError("INVALID_WINNER", "A draw isn't allowed in this match. One player has to win.");
  } else if (input.winnerId !== match.playerAId && input.winnerId !== match.playerBId) {
    throw new MatchError("INVALID_WINNER", "The declared winner must be one of the two players.");
  }

  const isPlayerA = input.submittingUserId === match.playerAId;
  const proofRef = await proofStorage.store(match.id, input.proofBuffer, input.proofContentType);
  const result: ResultPayload = {
    winnerId: input.winnerId,
    score: input.score,
    submittedAt: new Date().toISOString(),
    ...(input.kills != null ? { kills: input.kills } : {}),
  };

  const updated = await prisma.match.update({
    where: { id: match.id },
    data: isPlayerA
      ? { resultA: result as unknown as Prisma.InputJsonValue, proofARef: proofRef }
      : { resultB: result as unknown as Prisma.InputJsonValue, proofBRef: proofRef },
  });

  trackEvent("match_score_submitted", { userId: input.submittingUserId, matchId: match.id });

  return resolveAfterSubmission(updated, input.submittingUserId);
}

/**
 * The second player agrees with the result the first one reported. Recorded
 * as their own matching report (flagged `confirmed`, no proof of their own,
 * since the first report's proof is already on the match), so it takes the
 * exact same path as two agreeing reports: the match completes, the bracket
 * advances, payouts and notifications run. To disagree they report their own
 * result with proof instead (submitResult), which opens a dispute.
 */
export async function confirmResult(input: { matchId: string; confirmingUserId: string }): Promise<{ match: Match; outcome: SubmitResultOutcome }> {
  const match = await prisma.match.findUnique({
    where: { id: input.matchId },
    include: { tournament: { select: { status: true } } },
  });
  if (!match) throw new MatchError("NOT_FOUND", "Match not found.");
  if (match.tournament?.status === "CANCELLED") {
    throw new MatchError("TOURNAMENT_CANCELLED", "This tournament was cancelled. No results can be submitted.");
  }
  if (match.status === "COMPLETE") throw new MatchError("ALREADY_COMPLETE", "This match is already complete.");
  if (match.status === "DISPUTED") throw new MatchError("DISPUTED", "This match is under dispute review.");
  if (input.confirmingUserId !== match.playerAId && input.confirmingUserId !== match.playerBId) {
    throw new MatchError("NOT_A_PARTICIPANT", "Only the two players in this match can confirm a result.");
  }

  const isPlayerA = input.confirmingUserId === match.playerAId;
  const mine = isPlayerA ? match.resultA : match.resultB;
  const theirs = (isPlayerA ? match.resultB : match.resultA) as ResultPayload | null;
  if (mine) throw new MatchError("ALREADY_RESOLVED", "You've already reported this match.");
  if (!theirs) throw new MatchError("NOTHING_TO_CONFIRM", "Your opponent hasn't reported a result yet.");

  const confirmation: ResultPayload = { winnerId: theirs.winnerId, score: theirs.score, submittedAt: new Date().toISOString(), confirmed: true };
  const updated = await prisma.match.update({
    where: { id: match.id },
    data: isPlayerA ? { resultA: confirmation as unknown as Prisma.InputJsonValue } : { resultB: confirmation as unknown as Prisma.InputJsonValue },
  });
  trackEvent("match_score_submitted", { userId: input.confirmingUserId, matchId: match.id });
  return resolveAfterSubmission(updated, input.confirmingUserId);
}

async function resolveAfterSubmission(
  match: Match,
  submittingUserId: string
): Promise<{ match: Match; outcome: SubmitResultOutcome }> {
  if (!match.resultA || !match.resultB) {
    const updated = await prisma.match.update({
      where: { id: match.id },
      data: { status: "NEEDS_RESULT", reportWindowExpiresAt: new Date(Date.now() + AUTO_ACCEPT_WINDOW_MS) },
    });
    // The other side previously had no way to find out a result was even
    // waiting on them short of revisiting the page themselves.
    const otherPlayerId = submittingUserId === match.playerAId ? match.playerBId : match.playerAId;
    await notify(otherPlayerId, "RESULT_SUBMITTED", { matchId: match.id });
    return { match: updated, outcome: "RECORDED" };
  }

  const resultA = match.resultA as unknown as ResultPayload;
  const resultB = match.resultB as unknown as ResultPayload;
  const agree =
    resultA.winnerId === resultB.winnerId && normalizeScore(resultA.score) === normalizeScore(resultB.score);

  if (agree) {
    const completed = await completeMatch(match, resultA.winnerId);
    return { match: completed, outcome: "AUTO_COMPLETED" };
  }

  // Neither side "raised" this dispute in the sense of clicking a button —
  // it's system-detected from two conflicting reports. Attributing it to
  // whichever submission just completed the pair (and so triggered this
  // check) is the closest honest fit for Dispute.raisedById's NOT NULL
  // constraint.
  const disputed = await openDispute(match, submittingUserId);
  // openDispute can no-op (see its own comment) if this match was already
  // completed by a concurrent call — report the truthful outcome rather
  // than claiming a dispute that never actually opened.
  return { match: disputed, outcome: disputed.status === "COMPLETE" ? "AUTO_COMPLETED" : "DISPUTED" };
}

/**
 * Compare-and-swap on `status`, not a plain update — completeMatch is
 * reachable from three independent paths (immediate two-sided agreement,
 * the sweep's auto-accept on a stale single-sided report, and a dispute
 * ruling with a winner), and a real race between any two of them (a late
 * submission landing right as the sweep auto-accepts the same match; two
 * concurrent dispute rulings) previously ran the advancement/payout/
 * notification side effects below twice — double-paying a staked Battle's
 * winner, re-advancing an already-decided bracket slot, or resetting
 * Tournament.completedAt and relitigating the organizer-revenue
 * settlement window. Only the call that actually wins the race (count
 * === 1) runs any of that; a losing call is a pure no-op that returns the
 * row as whichever call got there first left it.
 */
async function completeMatch(match: Match, winnerId: string): Promise<Match> {
  // A league match that ends level is stored as complete with no winner.
  const isDraw = winnerId === DRAW_RESULT;
  if (isDraw && !(await drawAllowed(match))) throw new MatchError("INVALID_WINNER", "A draw isn't allowed in this match. One player has to win.");
  const storedWinner = isDraw ? null : winnerId;
  const result = await prisma.match.updateMany({
    where: { id: match.id, status: { not: "COMPLETE" } },
    data: { status: "COMPLETE", winnerId: storedWinner, reportWindowExpiresAt: null },
  });

  if (result.count === 0) {
    return prisma.match.findUniqueOrThrow({ where: { id: match.id } });
  }

  // North Star metric (PRD §17) — every real way a match reaches a
  // verified winner funnels through this one function (immediate
  // agreement, the sweep's auto-accept, or a dispute ruling with a
  // winner), so this is the one place it needs to fire.
  trackEvent("match_completed_verified", {
    matchId: match.id,
    tournamentId: match.tournamentId ?? undefined,
    userId: storedWinner ?? undefined,
  });

  if (match.tournamentId) {
    const tournament = await prisma.tournament.findUnique({ where: { id: match.tournamentId }, select: { format: true } });
    if (tournament?.format === "ROUND_ROBIN") await advanceRoundRobin(match.tournamentId);
    else if (tournament?.format === "LEAGUE") await advanceLeague(match.tournamentId);
    else if (tournament?.format === "DOUBLE_ELIMINATION") await advanceDoubleElim(match.tournamentId, match.id, winnerId);
    else if (tournament?.format === "SWISS") await advanceSwiss(match.tournamentId);
    else await applyWinnerAdvancement(match.tournamentId, match.id, winnerId);
  } else if (match.battleId) {
    // P4-5/BTL-5: the ladder counts wins from completed Battles — nothing
    // else in this file ever flips Battle.status, so without this the
    // ladder query would never find anything to count. Also settles any
    // stake — see settleBattleOnComplete's own comment.
    await settleBattleOnComplete(match.battleId, winnerId);
  }

  await Promise.all([
    notify(match.playerAId, "MATCH_COMPLETE", { matchId: match.id }),
    notify(match.playerBId, "MATCH_COMPLETE", { matchId: match.id }),
  ]);

  return { ...match, status: "COMPLETE", winnerId: storedWinner, reportWindowExpiresAt: null };
}

/**
 * Flips a Battle to COMPLETE and, if it was staked, pays the full pot
 * (both players' locked stakes — see `EscrowType.STAKE`, created at
 * Battle creation and matched at accept) to the winner, all in one
 * transaction so the status flip and the payout can't succeed/fail
 * independently. Core escrow mechanics only — see `EscrowTransaction`'s
 * own schema comment on what's deliberately not built yet (stake limits,
 * collusion detection, self-exclusion, legal review) before this is a
 * launch-ready staked-Battles feature.
 */
async function settleBattleOnComplete(battleId: string, winnerId: string): Promise<void> {
  // The Battle's own status is the latch: only the call that actually flips it to COMPLETE pays out,
  // and the flip and the payout share one transaction, so nobody can observe (or pay against) a
  // COMPLETE Battle whose pot was never released.
  //
  // This has to be a conditional write rather than a read-then-write. A Battle can have more than one
  // Match — a Battle that was reopened after a Match already existed would get a second one — and
  // every Match that completes calls this. A plain read of `status` here would let two calls both see
  // "not COMPLETE", both pay `stakeAmount * 2`, and the second payout would be unbacked: the second
  // accepter's stake was refunded when the first accept attempt "failed". Match.battleId is unique
  // now, so a second Match cannot be created again; this guard is the second lock, covering the one
  // Match that already exists plus any future caller of this function.
  const settled = await prisma.$transaction(async (tx) => {
    const claimed = await tx.battle.updateMany({
      where: { id: battleId, status: { not: "COMPLETE" } },
      data: { status: "COMPLETE" },
    });
    // Someone else settled this Battle first. They released the pot; this call must not release it again.
    if (claimed.count === 0) return null;

    const battle = await tx.battle.findUniqueOrThrow({ where: { id: battleId } });
    if (battle.stakeAmount <= 0) return battle;

    const pot = battle.stakeAmount * 2;
    await tx.user.update({ where: { id: winnerId }, data: { walletBalance: { increment: pot } } });
    await tx.escrowTransaction.create({
      data: { battleId, userId: winnerId, type: "STAKE_PAYOUT", amount: pot, status: "COMPLETE" },
    });
    await tx.walletTransaction.create({
      data: { userId: winnerId, type: "STAKE_CREDIT", amount: pot, status: "COMPLETE" },
    });
    return battle;
  });

  if (settled && settled.stakeAmount > 0) {
    trackEvent("escrow_payout_released", {
      userId: winnerId,
      amountMinor: settled.stakeAmount * 2,
      currency: "NGN",
      game: settled.game,
    });
  }
}

async function openDispute(match: Match, raisedById: string): Promise<Match> {
  // Same compare-and-swap reasoning as completeMatch: a late, disagreeing
  // submission can lose a race against the sweep's auto-accept (which
  // already completed this match off the OTHER side's single-sided
  // report) — without this guard, that late submission would flip an
  // already-COMPLETE match back to DISPUTED. If that's what happened,
  // there's nothing left to dispute; the completion that already
  // happened stands, and the caller (resolveAfterSubmission) checks the
  // returned status to report the truthful outcome.
  const result = await prisma.match.updateMany({
    where: { id: match.id, status: { not: "COMPLETE" } },
    data: { status: "DISPUTED", reportWindowExpiresAt: null },
  });
  if (result.count === 0) {
    return prisma.match.findUniqueOrThrow({ where: { id: match.id } });
  }

  const tournament = match.tournamentId
    ? await prisma.tournament.findUnique({
        where: { id: match.tournamentId },
        select: { organizerId: true },
      })
    : null;

  // D6: a Battle has no organizer, so it goes straight to staff. A
  // tournament dispute also skips straight to staff if the organizer is
  // one of the two disputants — nobody rules on their own match.
  const disputants = [match.playerAId, match.playerBId];
  const skipsOrganizerReview = !tournament || disputants.includes(tournament.organizerId);

  await prisma.dispute.create({
    data: {
      matchId: match.id,
      raisedById,
      status: skipsOrganizerReview ? "ESCALATED" : "ORGANIZER_REVIEW",
      organizerRulingDeadline: skipsOrganizerReview ? null : new Date(Date.now() + ORGANIZER_RULING_WINDOW_MS),
    },
  });

  await Promise.all([
    notify(match.playerAId, "RESULT_DISPUTED", { matchId: match.id }),
    notify(match.playerBId, "RESULT_DISPUTED", { matchId: match.id }),
  ]);
  if (!skipsOrganizerReview && tournament) {
    await notify(tournament.organizerId, "DISPUTE_NEEDS_RULING", { matchId: match.id });
  } else if (skipsOrganizerReview) {
    await notifyStaff("DISPUTE_ESCALATED", { matchId: match.id });
  }

  return { ...match, status: "DISPUTED", reportWindowExpiresAt: null };
}

// ---------------------------------------------------------------------------
// P3-8/P6-2: organizer ruling and staff ruling — same function, gated
// differently by who's allowed to call it and what state it must be in.
// ---------------------------------------------------------------------------

export type RulingInput = {
  disputeId: string;
  rulingUserId: string;
  isStaffRuling: boolean;
  ruling: string;
  winnerId?: string;
  voidMatch?: boolean;
};

export async function ruleDispute(input: RulingInput): Promise<Dispute> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: input.disputeId },
    include: { match: { include: { tournament: true, battle: true } } },
  });
  if (!dispute) throw new MatchError("NOT_FOUND", "Dispute not found.");
  if (dispute.match.tournament?.status === "CANCELLED") {
    throw new MatchError("TOURNAMENT_CANCELLED", "This tournament was cancelled. Nothing left to rule on.");
  }
  if (dispute.status === "RESOLVED" || dispute.status === "VOID") {
    throw new MatchError("ALREADY_RESOLVED", "This dispute has already been resolved.");
  }

  if (input.isStaffRuling) {
    if (dispute.status !== "ESCALATED") {
      throw new MatchError("NOT_ESCALATED", "Only escalated disputes are in the staff queue.");
    }
  } else {
    if (dispute.status !== "ORGANIZER_REVIEW") {
      throw new MatchError("NOT_ORGANIZER_REVIEW", "This dispute isn't awaiting organizer ruling.");
    }
    if (dispute.match.tournament?.organizerId !== input.rulingUserId) {
      throw new MatchError("FORBIDDEN", "Only this tournament's organizer can rule on it.");
    }
    if ([dispute.match.playerAId, dispute.match.playerBId].includes(input.rulingUserId)) {
      throw new MatchError("FORBIDDEN", "An organizer can't rule on their own match.");
    }
    if (dispute.organizerRulingDeadline && new Date() > dispute.organizerRulingDeadline) {
      throw new MatchError(
        "WINDOW_EXPIRED",
        "The ruling window has passed. This dispute needs to escalate to staff."
      );
    }
  }

  if (input.voidMatch) {
    // TRU-2 + PRD §19: voiding is only unambiguous for a Battle — a free
    // Battle has nothing to return, and a staked one has an unambiguous
    // answer too (return both stakes, see below). A bracket match — free
    // or paid — has no agreed-on void behavior (replay? split the round?
    // organizer's call?), so refuse rather than pick one silently.
    if (dispute.match.tournamentId) {
      throw new MatchError(
        "VOID_UNSUPPORTED",
        "Voiding a tournament bracket match isn't supported yet. See PRD §19; it needs a product decision, not an engineering guess."
      );
    }

    // Only reachable for a Battle match (the check above refuses any
    // match with a tournamentId), so battleId/battle are guaranteed here.
    //
    // Compare-and-swap on the dispute's own status (`dispute.status` here
    // is already confirmed ESCALATED/ORGANIZER_REVIEW by the checks
    // above, and nothing else in this file ever writes a dispute to
    // RESOLVED/VOID) — an interactive transaction, not a plain array of
    // writes, so two concurrent void rulings on the same dispute (staff
    // double-clicking, or two staff racing) can't both pass the claim and
    // both refund the same stake twice. A losing call throws
    // ALREADY_RESOLVED instead of silently re-crediting.
    const voidResult = await prisma.$transaction(async (tx) => {
      const claimed = await tx.dispute.updateMany({
        where: { id: dispute.id, status: dispute.status },
        data: {
          status: "VOID",
          ruling: input.ruling,
          ruledById: input.rulingUserId,
          ruledAt: new Date(),
        },
      });
      if (claimed.count === 0) return null;

      await tx.match.update({
        where: { id: dispute.matchId },
        data: { status: "COMPLETE", reportWindowExpiresAt: null },
      });

      if (dispute.match.battleId && dispute.match.battle) {
        await tx.battle.update({ where: { id: dispute.match.battleId }, data: { status: "COMPLETE" } });
        // Both sides' locked stakes go back — a void means nobody won,
        // not that the pot is up for grabs. Same amount each, since accept
        // requires matching the creator's stake exactly.
        const stake = dispute.match.battle.stakeAmount;
        if (stake > 0) {
          for (const playerId of [dispute.match.playerAId, dispute.match.playerBId]) {
            await tx.user.update({ where: { id: playerId }, data: { walletBalance: { increment: stake } } });
            await tx.escrowTransaction.create({
              data: { battleId: dispute.match.battleId, userId: playerId, type: "REFUND", amount: stake, status: "COMPLETE" },
            });
            await tx.walletTransaction.create({
              data: { userId: playerId, type: "STAKE_CREDIT", amount: stake, status: "COMPLETE" },
            });
          }
        }
      }

      return tx.dispute.findUniqueOrThrow({ where: { id: dispute.id } });
    });

    if (!voidResult) {
      throw new MatchError("ALREADY_RESOLVED", "This dispute has already been resolved.");
    }

    // V1 audit follow-up: only a staff ruling is a real "admin action" —
    // an organizer has no void path (refused above for tournament
    // matches, and a Battle organizer doesn't exist), so this only ever
    // fires for staff, same "reuse the audit log" convention as every
    // other sensitive admin write.
    if (input.isStaffRuling) {
      await logAdminAction({
        actorId: input.rulingUserId,
        action: "dispute.void",
        targetType: "Dispute",
        targetId: dispute.id,
        metadata: { matchId: dispute.matchId, ruling: input.ruling },
      });
    }

    await Promise.all([
      notify(dispute.match.playerAId, "DISPUTE_RESOLVED", { matchId: dispute.matchId, voided: true }),
      notify(dispute.match.playerBId, "DISPUTE_RESOLVED", { matchId: dispute.matchId, voided: true }),
    ]);
    return voidResult;
  }

  if (input.winnerId === DRAW_RESULT) {
    if (!(await drawAllowed(dispute.match))) throw new MatchError("INVALID_WINNER", "A draw isn't allowed in this match. One player has to win.");
  } else if (!input.winnerId || ![dispute.match.playerAId, dispute.match.playerBId].includes(input.winnerId)) {
    throw new MatchError("INVALID_WINNER", "The ruled winner must be one of the two players.");
  }

  // Same compare-and-swap reasoning as the void branch above — two
  // concurrent rulings on the same dispute (a double-click, or two staff
  // racing on the same escalated dispute) shouldn't both succeed. The
  // losing call throws ALREADY_RESOLVED rather than overwriting the
  // first call's ruling/ruledById and re-running completeMatch.
  const claimed = await prisma.dispute.updateMany({
    where: { id: dispute.id, status: dispute.status },
    data: {
      status: "RESOLVED",
      ruling: input.ruling,
      ruledById: input.rulingUserId,
      ruledAt: new Date(),
    },
  });
  if (claimed.count === 0) {
    throw new MatchError("ALREADY_RESOLVED", "This dispute has already been resolved.");
  }
  const updatedDispute = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } });

  await completeMatch(dispute.match, input.winnerId);

  // V1 audit follow-up: an organizer ruling on their own tournament's
  // dispute is routine self-service (same reasoning as tournament
  // cancellation's own audit-log condition) — only a staff ruling
  // deciding a match winner is a real admin action worth the trail.
  if (input.isStaffRuling) {
    await logAdminAction({
      actorId: input.rulingUserId,
      action: "dispute.rule",
      targetType: "Dispute",
      targetId: dispute.id,
      metadata: { matchId: dispute.matchId, winnerId: input.winnerId, ruling: input.ruling },
    });
  }

  await Promise.all([
    notify(dispute.match.playerAId, "DISPUTE_RESOLVED", { matchId: dispute.matchId }),
    notify(dispute.match.playerBId, "DISPUTE_RESOLVED", { matchId: dispute.matchId }),
  ]);

  return updatedDispute;
}

// ---------------------------------------------------------------------------
// League: an organizer settles a fixture nobody played by its matchday
// deadline — a forfeit win for one side, or a draw where draws are allowed.
// ---------------------------------------------------------------------------

export async function awardLeagueResult(input: { matchId: string; organizerId: string; outcome: string; score?: string }): Promise<Match> {
  const match = await prisma.match.findUnique({ where: { id: input.matchId }, include: { tournament: { include: { bracket: { select: { structure: true } } } } } });
  if (!match || !match.tournament) throw new MatchError("NOT_FOUND", "Match not found.");
  const tournament = match.tournament;
  if (tournament.format !== "LEAGUE") throw new MatchError("FORBIDDEN", "Results can only be awarded in a league.");
  if (tournament.organizerId !== input.organizerId) throw new MatchError("FORBIDDEN", "Only this league's organizer can award a result.");
  if ([match.playerAId, match.playerBId].includes(input.organizerId)) throw new MatchError("FORBIDDEN", "An organizer can't award their own match.");
  if (tournament.status === "CANCELLED") throw new MatchError("TOURNAMENT_CANCELLED", "This tournament was cancelled.");
  if (match.status === "COMPLETE") throw new MatchError("ALREADY_COMPLETE", "This match is already complete.");
  if (match.status === "DISPUTED") throw new MatchError("DISPUTED", "This match is under dispute review. Rule on the dispute instead.");

  const structure = tournament.bracket?.structure;
  const deadline = isLeagueStructure(structure) ? structure.deadlines[(match.round ?? 0) - 1] : undefined;
  if (!deadline) throw new MatchError("FORBIDDEN", "Only a scheduled matchday fixture can be awarded.");
  if (Date.now() < new Date(deadline).getTime()) throw new MatchError("FORBIDDEN", "This fixture isn't overdue yet. Players can still play it.");

  const isDraw = input.outcome === DRAW_RESULT;
  if (isDraw && !(await drawAllowed(match))) throw new MatchError("INVALID_WINNER", "Draws aren't allowed in this league.");
  if (!isDraw && input.outcome !== match.playerAId && input.outcome !== match.playerBId) throw new MatchError("INVALID_WINNER", "The awarded winner must be one of the two players.");

  const payload: ResultPayload = {
    winnerId: input.outcome,
    score: input.score?.trim() || (isDraw ? "0-0" : "3-0"),
    submittedAt: new Date().toISOString(),
    awarded: true,
  };
  const json = payload as unknown as Prisma.InputJsonValue;
  const updated = await prisma.match.update({ where: { id: match.id }, data: { resultA: json, resultB: json } });
  const completed = await completeMatch(updated, input.outcome);

  await logAdminAction({
    actorId: input.organizerId,
    action: "league.award",
    targetType: "Match",
    targetId: match.id,
    metadata: { tournamentId: tournament.id, outcome: input.outcome, score: payload.score },
  }).catch(() => undefined);
  await Promise.all(
    [match.playerAId, match.playerBId].map((id) => notify(id, "LEAGUE_RESULT_AWARDED", { matchId: match.id, tournamentId: tournament.id, tournamentName: tournament.name, outcome: isDraw ? "DRAW" : input.outcome === id ? "WIN" : "LOSS" }))
  );
  return completed;
}

// ---------------------------------------------------------------------------
// P4-4: Battles' entry point into this engine. Accepting a Battle creates
// a Match exactly the way bracket generation does — same unique-code
// helper, no separate creation path — and every function above already
// handles battleId-only matches (no tournamentId) generically. This is
// the whole proof that the engine didn't need a Battle-specific fork.
// ---------------------------------------------------------------------------

export async function createBattleMatch(
  battle: { id: string; creatorId: string },
  accepterId: string
): Promise<Match> {
  return createMatchWithUniqueCode({
    battleId: battle.id,
    playerAId: battle.creatorId,
    playerBId: accepterId,
  });
}

// ---------------------------------------------------------------------------
// P3-6/BRK-6/BRK-1(deadline path): the one scheduled sweep this phase
// needs. Not wired to an actual scheduler yet (docs/circuit-stack.md's
// Vercel Cron recommendation still needs a deployment target) — this is
// the function that route would call.
// ---------------------------------------------------------------------------

export async function runScheduledSweep(): Promise<{
  bracketsGenerated: number;
  advancementRepaired: number;
  autoAccepted: number;
  escalated: number;
  marketplaceHoldsReleased: number;
  payoutsAutoApproved: number;
  payoutsHeldForStaff: number;
  organizerRevenueSettled: number;
  quickMatchExpired: number;
  quickMatchRecoveredStuck: number;
  battlesExpired: number;
  stakePatternsFlagged: number;
  transfersSettled: number;
  latePaymentsChecked: number;
  errors?: string[];
}> {
  const now = new Date();
  const errors: string[] = [];
  let bracketsGenerated = 0;
  let autoAccepted = 0;
  let escalated = 0;

  const readyTournaments = await prisma.tournament.findMany({
    where: {
      registrationCloseAt: { lte: now },
      status: { notIn: ["CANCELLED", "COMPLETE", "LIVE"] },
      bracket: null,
    },
    select: { id: true, organizerId: true },
  });
  for (const tournament of readyTournaments) {
    try {
      await notify(tournament.organizerId, "REGISTRATION_CLOSED", { tournamentId: tournament.id });
      await generateBracket(tournament.id);
      bracketsGenerated++;
    } catch (err) {
      console.error(`[sweep] Error generating bracket for tournament ${tournament.id}:`, err);
      // V1 audit follow-up: this sweep drives match completion (and
      // therefore payouts) on a timer with no human watching it — a
      // recurring failure here previously only reached the console.
      captureException(err, { source: "sweep:bracketGeneration", tournamentId: tournament.id });
      errors.push(`tournament:${tournament.id}`);
    }
  }

  // Excludes a cancelled tournament's matches — auto-accepting a stale
  // result would silently advance a bracket that's supposed to be void
  // (a live cancel voids everything and refunds everyone; letting the
  // sweep keep completing its matches afterward would undermine that).
  // Battle matches (tournamentId null) are unaffected either way.
  const staleMatches = await prisma.match.findMany({
    where: {
      status: "NEEDS_RESULT",
      reportWindowExpiresAt: { lte: now },
      OR: [{ tournamentId: null }, { tournament: { status: { not: "CANCELLED" } } }],
    },
  });
  for (const match of staleMatches) {
    try {
      const reported = (match.resultA ?? match.resultB) as unknown as ResultPayload | null;
      if (!reported) continue; // defensive — shouldn't be reachable
      await completeMatch(match, reported.winnerId);
      autoAccepted++;
    } catch (err) {
      console.error(`[sweep] Error auto-accepting match ${match.id}:`, err);
      captureException(err, { source: "sweep:autoAccept", matchId: match.id });
      errors.push(`match:${match.id}`);
    }
  }

  // Same reasoning as staleMatches above — a dispute on a now-voided
  // tournament's match has nothing left to escalate to staff for.
  const overdueDisputes = await prisma.dispute.findMany({
    where: {
      status: "ORGANIZER_REVIEW",
      organizerRulingDeadline: { lte: now },
      match: { OR: [{ tournamentId: null }, { tournament: { status: { not: "CANCELLED" } } }] },
    },
  });
  for (const dispute of overdueDisputes) {
    try {
      await prisma.dispute.update({ where: { id: dispute.id }, data: { status: "ESCALATED" } });
      await notifyStaff("DISPUTE_ESCALATED", { matchId: dispute.matchId });
      escalated++;
    } catch (err) {
      console.error(`[sweep] Error escalating dispute ${dispute.id}:`, err);
      captureException(err, { source: "sweep:disputeEscalation", disputeId: dispute.id });
      errors.push(`dispute:${dispute.id}`);
    }
  }

  // Its own concern (revenue settlement, not match/bracket progression),
  // folded into this one sweep call rather than a second cron entry — see
  // this file's own header on the Battle/tournament split for the same
  // "one function, branch inside it" preference.
  // Card orders whose payment never arrived give their held unit back (src/lib/marketplaceCheckout.ts).
  let marketplaceHolds: { released: number; confirmed: number } = { released: 0, confirmed: 0 };
  try {
    const { expireUnpaidOrders } = await import("@/lib/marketplaceCheckout");
    const expiry = await expireUnpaidOrders();
    marketplaceHolds = expiry;
    if (expiry.errors) errors.push(...expiry.errors);
  } catch (err) {
    captureException(err, { source: "sweep:expireUnpaidOrders" });
    errors.push("expireUnpaidOrders");
  }

  // Approve the payouts with nothing wrong (see payoutApproval.ts) before settling, so what was just
  // approved can be released in this same run.
  const payoutApproval = await autoApprovePayouts();
  if (payoutApproval.errors) errors.push(...payoutApproval.errors);
  const settlement = await settleOrganizerRevenue();
  if (settlement.errors) errors.push(...settlement.errors);

  // Same "one sweep, several unrelated concerns folded in" reasoning —
  // Quick Match's own safety net for a host who never polls again after
  // closing the tab, and for a challenge stuck ACCEPTED with no Battle
  // because its own in-request recovery also failed. See
  // sweepQuickMatchChallenges's own doc comment.
  const quickMatchSweep = await sweepQuickMatchChallenges();
  if (quickMatchSweep.errors.length > 0) errors.push(...quickMatchSweep.errors);

  // Challenges nobody accepted in time close, and any stake goes back.
  const battleExpiry = await expireOpenBattles();
  if (battleExpiry.errors.length > 0) errors.push(...battleExpiry.errors);

  const repair = await repairStalledAdvancement();
  if (repair.errors.length > 0) errors.push(...repair.errors);

  // The other half of the staked-Battles controls: the per-account limits in
  // src/lib/stakes.ts bound how much one account can move, and this reads
  // who it keeps moving it to. Same "one sweep, several unrelated concerns
  // folded in" reasoning as everything above — see stakePatterns.ts for the
  // rules, and for why this queues a pair for a person rather than acting.
  const stakePatterns = await detectStakePatterns(now);
  if (stakePatterns.errors.length > 0) errors.push(...stakePatterns.errors);

  // Money backstop for webhooks that never arrive — see src/lib/payments/transfers.ts.
  let money = { transfersSettled: 0, latePaymentsChecked: 0 };
  try {
    const { reconcilePendingMoney } = await import("@/lib/payments/transfers");
    money = await reconcilePendingMoney();
  } catch (err) {
    captureException(err, { source: "sweep:reconcilePendingMoney" });
    errors.push("reconcilePendingMoney");
  }

  return {
    bracketsGenerated,
    advancementRepaired: repair.repaired,
    autoAccepted,
    escalated,
    marketplaceHoldsReleased: marketplaceHolds.released,
    payoutsAutoApproved: payoutApproval.approved,
    payoutsHeldForStaff: payoutApproval.heldForStaff,
    organizerRevenueSettled: settlement.settled,
    quickMatchExpired: quickMatchSweep.expired,
    quickMatchRecoveredStuck: quickMatchSweep.recoveredStuck,
    battlesExpired: battleExpiry.expired,
    stakePatternsFlagged: stakePatterns.flagged,
    ...money,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

/**
 * Safety net for completeMatch: the match is marked COMPLETE first and the
 * tournament advanced afterwards, so a failure in between (a transaction
 * timeout on a slow connection, a dropped connection) leaves a finished
 * match whose result never reached the bracket — and nothing else would
 * retry it. Every sweep, for live head-to-head tournaments, this replays
 * the advancement for any completed match its structure hasn't recorded.
 * Each engine's advancement is safe to re-run.
 */
async function repairStalledAdvancement(): Promise<{ repaired: number; errors: string[] }> {
  const errors: string[] = [];
  let repaired = 0;
  const live = await prisma.tournament.findMany({ where: { status: "LIVE", competitionStyle: "HEAD_TO_HEAD" }, select: { id: true, format: true } });
  for (const t of live) {
    try {
      const bracket = await prisma.bracket.findUnique({ where: { tournamentId: t.id } });
      if (!bracket) continue;
      const matches = await prisma.match.findMany({ where: { tournamentId: t.id }, select: { id: true, status: true, winnerId: true } });
      const done = matches.filter((m) => m.status === "COMPLETE" && m.winnerId);
      if (isRoundRobinStructure(bracket.structure) || isSwissStructure(bracket.structure) || isLeagueStructure(bracket.structure)) {
        // Stalled only when nothing is left to play: the next step (a new
        // Swiss round, a decider, or completing) never ran.
        if (matches.length > 0 && matches.every((m) => m.status === "COMPLETE")) {
          if (isSwissStructure(bracket.structure)) await advanceSwiss(t.id);
          else if (isLeagueStructure(bracket.structure)) await advanceLeague(t.id);
          else await advanceRoundRobin(t.id);
          repaired++;
        }
        continue;
      }
      if (isDoubleElimStructure(bracket.structure)) {
        for (const m of done) {
          const n = nodeByMatch(bracket.structure, m.id);
          if (n && !n.resolved) {
            await advanceDoubleElim(t.id, m.id, m.winnerId!);
            repaired++;
          }
        }
        continue;
      }
      const structure = bracket.structure as unknown as BracketStructure;
      for (const m of done) {
        const loc = findSlotByMatchId(structure, m.id);
        const slot = loc ? structure.rounds.find((r) => r.round === loc.round)?.slots[loc.position] : null;
        if (slot && slot.winnerId !== m.winnerId) {
          await applyWinnerAdvancement(t.id, m.id, m.winnerId!);
          repaired++;
        }
      }
    } catch (err) {
      captureException(err, { source: "sweep:repairAdvancement", tournamentId: t.id });
      errors.push(`advance:${t.id}`);
    }
  }
  return { repaired, errors };
}

/** Called inline from the registrations route once a confirmation pushes
 *  the tournament to its cap — the other trigger for BRK-1, alongside the
 *  deadline path the sweep handles. */
export async function maybeGenerateBracketOnCapFill(tournamentId: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { participantCap: true, organizerId: true },
  });
  if (!tournament) return;

  const confirmedCount = await prisma.registration.count({
    where: { tournamentId, status: "CONFIRMED" },
  });
  if (confirmedCount >= tournament.participantCap) {
    await notify(tournament.organizerId, "REGISTRATION_CAP_FILLED", { tournamentId });
    await generateBracket(tournamentId);
  }
}
