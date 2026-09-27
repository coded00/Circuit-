/**
 * Circuit — lobby (battle royale) tournaments, game catalog phase 4.
 *
 * One lobby, several rounds (owner's call — no group splits). When
 * registration closes (deadline or cap), startLobby creates the rounds
 * and the tournament goes LIVE — the same moment a bracket would be
 * generated, and called from the same place (generateBracket).
 *
 * After each round the organizer enters every entry's placement and
 * kills; points come from the table snapshotted on the tournament (see
 * lobbyScoring.ts). Results are visible as soon as they're posted.
 * Players can flag a posted round: the organizer answers (corrects the
 * results and resolves, or dismisses), and a player can escalate a
 * dismissed flag — or one the organizer hasn't answered in 24h — to
 * Circuit staff, whose answer is final. Staff can edit results too.
 *
 * The organizer finalises once every round is posted and no flag is
 * waiting; the tournament goes COMPLETE and the top of the leaderboard
 * wins everything (winner takes all — the captain, for team entries),
 * claimed through the same payout route as a bracket winner.
 */

import type { LobbyFlagStatus, Tournament, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notify, notifyStaff } from "@/lib/notifications";
import { teamEntryLabels } from "@/lib/teamEntries";
import {
  buildLeaderboard,
  effectiveTable,
  leaderboardWinner,
  pointsFor,
  validateRoundResults,
  type LeaderboardRow,
  type PointsTable,
} from "@/lib/lobbyScoring";

/** How long an organizer has to answer a flag before the player can take it to staff, and how long a player has to escalate a dismissal. */
export const FLAG_ANSWER_HOURS = 24;
const HOUR = 3600e3;
const MIN_REASON = 10;
const MAX_REASON = 1000;
const MAX_NOTE = 1000;

export class LobbyError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "LobbyError";
  }
}

type Actor = Pick<User, "id" | "isStaff">;

export function canManageLobby(actor: Actor | null, tournament: Pick<Tournament, "organizerId">): boolean {
  return !!actor && (actor.isStaff || actor.id === tournament.organizerId);
}

export function tableOf(t: Pick<Tournament, "placementPoints" | "killPoints">): PointsTable {
  return effectiveTable(t);
}

/** Everyone who should hear about the lobby: each entry's user (captain) and roster. */
async function entrantUserIds(tournamentId: string): Promise<string[]> {
  const regs = await prisma.registration.findMany({
    where: { tournamentId, status: "CONFIRMED" },
    select: { userId: true, roster: { select: { userId: true } } },
  });
  return [...new Set(regs.flatMap((r) => [r.userId, ...r.roster.map((m) => m.userId)]))];
}

// ----------------------------------------------------------- Start

/**
 * Creates the rounds and flips the tournament LIVE. Safe to call more
 * than once (the unique round number and the status guard make repeats
 * no-ops). Needs at least two confirmed entries, same as a bracket.
 */
export async function startLobby(tournamentId: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament || tournament.competitionStyle !== "LOBBY") return;
  const confirmed = await prisma.registration.count({ where: { tournamentId, status: "CONFIRMED" } });
  if (confirmed < 2) return;
  const rounds = Math.max(1, tournament.lobbyRounds ?? 1);
  const started = await prisma.$transaction(async (tx) => {
    const flipped = await tx.tournament.updateMany({
      where: { id: tournamentId, status: { notIn: ["LIVE", "COMPLETE", "CANCELLED"] } },
      data: { status: "LIVE" },
    });
    if (flipped.count === 0) return false;
    await tx.lobbyRound.createMany({
      data: Array.from({ length: rounds }, (_, i) => ({ tournamentId, number: i + 1 })),
      skipDuplicates: true,
    });
    return true;
  });
  if (!started) return;
  const users = await entrantUserIds(tournamentId);
  await Promise.all(users.map((id) => notify(id, "LOBBY_STARTED", { tournamentId, tournamentName: tournament.name, rounds: String(rounds) })));
}

// ----------------------------------------------------------- Reading

export type LobbyEntry = {
  registrationId: string;
  userId: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  tag: string | null;
  inGameId: string | null;
  roster: { handle: string; displayName: string }[];
};

export type LobbyFlagView = {
  id: string;
  roundNumber: number;
  status: LobbyFlagStatus;
  reason: string;
  response: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  escalatedAt: Date | null;
  user: { id: string; handle: string; displayName: string };
};

export type LobbyRoundView = {
  id: string;
  number: number;
  status: "PENDING" | "POSTED";
  postedAt: Date | null;
  proofUrl: string | null;
  results: { registrationId: string; placement: number | null; kills: number; points: number }[];
  flags: LobbyFlagView[];
};

export type LobbyView = {
  entries: LobbyEntry[];
  rounds: LobbyRoundView[];
  board: LeaderboardRow[];
  table: PointsTable;
  /** Set once the tournament is COMPLETE. */
  winner: LobbyEntry | null;
};

export async function loadLobby(tournament: Pick<Tournament, "id" | "status" | "placementPoints" | "killPoints">): Promise<LobbyView> {
  const [regs, rounds, labels] = await Promise.all([
    prisma.registration.findMany({
      where: { tournamentId: tournament.id, status: "CONFIRMED" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { handle: true, displayName: true, avatarUrl: true } } },
    }),
    prisma.lobbyRound.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { number: "asc" },
      include: {
        results: true,
        flags: { orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, handle: true, displayName: true } } } },
      },
    }),
    teamEntryLabels(tournament.id),
  ]);
  const entries: LobbyEntry[] = regs.map((r) => {
    const team = labels.get(r.userId);
    return {
      registrationId: r.id,
      userId: r.userId,
      name: team?.teamName ?? r.user.displayName,
      handle: r.user.handle,
      avatarUrl: team ? null : r.user.avatarUrl,
      tag: team?.tag ?? null,
      inGameId: r.inGameId,
      roster: team?.roster.map((m) => ({ handle: m.handle, displayName: m.displayName })) ?? [],
    };
  });
  const table = tableOf(tournament);
  const posted = rounds.filter((r) => r.status === "POSTED");
  const board = buildLeaderboard(
    entries.map((e) => e.registrationId),
    posted.flatMap((r) => r.results.map((x) => ({ roundNumber: r.number, registrationId: x.registrationId, placement: x.placement, kills: x.kills }))),
    table
  );
  const winnerId = tournament.status === "COMPLETE" ? leaderboardWinner(board) : null;
  return {
    entries,
    table,
    board,
    winner: entries.find((e) => e.registrationId === winnerId) ?? null,
    rounds: rounds.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      postedAt: r.postedAt,
      proofUrl: r.proofUrl,
      results: r.results.map((x) => ({ registrationId: x.registrationId, placement: x.placement, kills: x.kills, points: x.points })),
      flags: r.flags.map((f) => ({
        id: f.id,
        roundNumber: r.number,
        status: f.status,
        reason: f.reason,
        response: f.response,
        createdAt: f.createdAt,
        resolvedAt: f.resolvedAt,
        escalatedAt: f.escalatedAt,
        user: f.user,
      })),
    })),
  };
}

/**
 * Who won a COMPLETE tournament, as a user id (the captain for team
 * entries): the top of the lobby leaderboard, or the final bracket
 * match's winner. Null while it's still running.
 */
export async function tournamentWinnerId(tournament: Pick<Tournament, "id" | "status" | "competitionStyle" | "placementPoints" | "killPoints">): Promise<string | null> {
  if (tournament.status !== "COMPLETE") return null;
  if (tournament.competitionStyle === "LOBBY") {
    return (await loadLobby(tournament)).winner?.userId ?? null;
  }
  const finalMatch = await prisma.match.findFirst({
    where: { tournamentId: tournament.id, round: { not: null } },
    orderBy: { round: "desc" },
  });
  return finalMatch?.winnerId ?? null;
}

// ----------------------------------------------------------- Results

async function lobbyTournament(tournamentId: string): Promise<Tournament> {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament || tournament.competitionStyle !== "LOBBY") throw new LobbyError("Lobby tournament not found.", 404);
  return tournament;
}

export async function saveRoundResults(input: {
  tournamentId: string;
  roundNumber: number;
  actor: Actor;
  results: unknown;
  proofUrl: string | null;
}): Promise<void> {
  const tournament = await lobbyTournament(input.tournamentId);
  if (!canManageLobby(input.actor, tournament)) throw new LobbyError("Only the organizer can enter results.", 403);
  if (tournament.status !== "LIVE") {
    throw new LobbyError(tournament.status === "COMPLETE" ? "Results are final — this tournament is complete." : "The lobby hasn't started yet.", 409);
  }
  const round = await prisma.lobbyRound.findUnique({ where: { tournamentId_number: { tournamentId: tournament.id, number: input.roundNumber } } });
  if (!round) throw new LobbyError("That round doesn't exist.", 404);
  const entries = await prisma.registration.findMany({ where: { tournamentId: tournament.id, status: "CONFIRMED" }, select: { id: true } });
  const parsed = validateRoundResults(input.results, entries.map((e) => e.id));
  if (!parsed.ok) throw new LobbyError(parsed.error);
  const table = tableOf(tournament);
  const firstPost = round.status === "PENDING";
  await prisma.$transaction([
    prisma.lobbyResult.deleteMany({ where: { roundId: round.id } }),
    prisma.lobbyResult.createMany({
      data: parsed.value.map((r) => ({ roundId: round.id, registrationId: r.registrationId, placement: r.placement, kills: r.kills, points: pointsFor(r.placement, r.kills, table) })),
    }),
    prisma.lobbyRound.update({
      where: { id: round.id },
      data: { status: "POSTED", postedAt: round.postedAt ?? new Date(), postedById: input.actor.id, proofUrl: input.proofUrl },
    }),
  ]);
  if (firstPost) {
    const users = await entrantUserIds(tournament.id);
    await Promise.all(users.map((id) => notify(id, "LOBBY_ROUND_POSTED", { tournamentId: tournament.id, tournamentName: tournament.name, round: String(round.number) })));
  }
}

/** Why the organizer can't finalise yet, or null if they can. */
export function finaliseBlocker(view: Pick<LobbyView, "rounds" | "board">, now = new Date()): string | null {
  const pending = view.rounds.filter((r) => r.status !== "POSTED");
  if (pending.length > 0) return `Post results for round ${pending.map((r) => r.number).join(", ")} first.`;
  const flags = view.rounds.flatMap((r) => r.flags);
  if (flags.some((f) => f.status === "OPEN")) return "Answer the open flags first.";
  if (flags.some((f) => f.status === "ESCALATED")) return "A flag is with Circuit staff — wait for their answer.";
  const appealable = flags.find((f) => f.status === "DISMISSED" && !f.escalatedAt && f.resolvedAt && now.getTime() - f.resolvedAt.getTime() < FLAG_ANSWER_HOURS * HOUR);
  if (appealable) {
    const until = new Date(appealable.resolvedAt!.getTime() + FLAG_ANSWER_HOURS * HOUR);
    return `A player can still take a dismissed flag to Circuit staff until ${until.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}.`;
  }
  if (!leaderboardWinner(view.board)) return "First place is tied on every tiebreak — check the results before finalising.";
  return null;
}

export async function finaliseLobby(tournamentId: string, actor: Actor): Promise<void> {
  const tournament = await lobbyTournament(tournamentId);
  if (!canManageLobby(actor, tournament)) throw new LobbyError("Only the organizer can finalise results.", 403);
  if (tournament.status !== "LIVE") throw new LobbyError("Only a live lobby can be finalised.", 409);
  const view = await loadLobby(tournament);
  const blocker = finaliseBlocker(view);
  if (blocker) throw new LobbyError(blocker, 409);
  const flipped = await prisma.tournament.updateMany({ where: { id: tournamentId, status: "LIVE" }, data: { status: "COMPLETE", completedAt: new Date() } });
  if (flipped.count === 0) return;
  const winner = view.entries.find((e) => e.registrationId === leaderboardWinner(view.board));
  await Promise.all([
    winner ? notify(winner.userId, "TOURNAMENT_COMPLETE", { tournamentId, isOrganizer: false }) : undefined,
    notify(tournament.organizerId, "TOURNAMENT_COMPLETE", { tournamentId, isOrganizer: true }),
  ]);
}

// ----------------------------------------------------------- Flags

export async function raiseFlag(input: { tournamentId: string; roundNumber: number; user: Actor; reason: unknown }): Promise<void> {
  const tournament = await lobbyTournament(input.tournamentId);
  if (tournament.status !== "LIVE") throw new LobbyError("Flags can only be raised while the lobby is live.", 409);
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length < MIN_REASON) throw new LobbyError(`Say what's wrong (at least ${MIN_REASON} characters).`);
  if (reason.length > MAX_REASON) throw new LobbyError(`Keep it under ${MAX_REASON} characters.`);
  const round = await prisma.lobbyRound.findUnique({ where: { tournamentId_number: { tournamentId: tournament.id, number: input.roundNumber } } });
  if (!round || round.status !== "POSTED") throw new LobbyError("You can flag a round once its results are posted.", 409);
  const inTournament = await prisma.registration.findFirst({
    where: { tournamentId: tournament.id, status: "CONFIRMED", OR: [{ userId: input.user.id }, { roster: { some: { userId: input.user.id } } }] },
    select: { id: true },
  });
  if (!inTournament) throw new LobbyError("Only players in this tournament can flag results.", 403);
  const existing = await prisma.lobbyFlag.findFirst({ where: { roundId: round.id, userId: input.user.id, status: { in: ["OPEN", "ESCALATED"] } } });
  if (existing) throw new LobbyError("You already have a flag waiting on this round.", 409);
  await prisma.lobbyFlag.create({ data: { roundId: round.id, userId: input.user.id, reason } });
  await notify(tournament.organizerId, "LOBBY_FLAG_RAISED", { tournamentId: tournament.id, tournamentName: tournament.name, round: String(round.number) });
}

export type FlagAction = "resolve" | "dismiss" | "escalate";

export async function answerFlag(input: { flagId: string; actor: Actor; action: unknown; note: unknown }): Promise<void> {
  const flag = await prisma.lobbyFlag.findUnique({ where: { id: input.flagId }, include: { round: { include: { tournament: true } } } });
  if (!flag) throw new LobbyError("Flag not found.", 404);
  const tournament = flag.round.tournament;
  const action = input.action;
  const note = typeof input.note === "string" ? input.note.trim().slice(0, MAX_NOTE) : "";
  const now = new Date();

  if (action === "escalate") {
    if (flag.userId !== input.actor.id) throw new LobbyError("Only the player who raised this flag can escalate it.", 403);
    if (tournament.status !== "LIVE") throw new LobbyError("This tournament is no longer live.", 409);
    if (flag.escalatedAt) throw new LobbyError("This flag has already been to Circuit staff.", 409);
    const unanswered = flag.status === "OPEN" && now.getTime() - flag.createdAt.getTime() >= FLAG_ANSWER_HOURS * HOUR;
    if (flag.status !== "DISMISSED" && !unanswered) {
      throw new LobbyError(
        flag.status === "OPEN" ? `The organizer has ${FLAG_ANSWER_HOURS} hours to answer before this can go to staff.` : "Only a dismissed flag can be escalated.",
        409
      );
    }
    await prisma.lobbyFlag.update({ where: { id: flag.id }, data: { status: "ESCALATED", escalatedAt: now } });
    await notifyStaff("LOBBY_FLAG_ESCALATED", { tournamentId: tournament.id, tournamentName: tournament.name, round: String(flag.round.number) });
    return;
  }

  if (action !== "resolve" && action !== "dismiss") throw new LobbyError("Unknown action.");
  if (flag.status === "ESCALATED") {
    if (!input.actor.isStaff) throw new LobbyError("This flag is with Circuit staff.", 403);
  } else if (flag.status === "OPEN") {
    if (!canManageLobby(input.actor, tournament)) throw new LobbyError("Only the organizer can answer flags.", 403);
  } else {
    throw new LobbyError("This flag has already been answered.", 409);
  }
  if (action === "dismiss" && note.length < 3) throw new LobbyError("Say why the results stand.");
  await prisma.lobbyFlag.update({
    where: { id: flag.id },
    data: { status: action === "resolve" ? "RESOLVED" : "DISMISSED", response: note || null, respondedById: input.actor.id, resolvedAt: now },
  });
  await notify(flag.userId, "LOBBY_FLAG_ANSWERED", {
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    round: String(flag.round.number),
    outcome: action === "resolve" ? "resolved" : "dismissed",
    byStaff: flag.status === "ESCALATED",
  });
}
