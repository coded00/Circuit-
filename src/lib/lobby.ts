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

import type { LobbyFlagStatus, LobbyStage, Tournament, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notify, notifyStaff } from "@/lib/notifications";
import { teamEntryLabels } from "@/lib/teamEntries";
import { loadLeagueStandings } from "@/lib/roundRobinStandings";
import { isDoubleElimStructure } from "@/lib/doubleElim";
import {
  buildLeaderboard,
  effectiveTable,
  leaderboardWinner,
  pointsFor,
  validateRoundResults,
  dealGroups,
  effectiveGroups,
  groupLetter,
  qualifiersFrom,
  type LobbyGroupsConfig,
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

/** Which lobby a round is played in: the one lobby, a group, or the final. */
export type RoundScope = { stage: LobbyStage; group: number };

/** Registrations playing in a scope (all of them for a single lobby). */
function scopeWhere(scope?: RoundScope) {
  if (!scope || scope.stage === "MAIN") return {};
  return scope.stage === "GROUP" ? { lobbyGroup: scope.group } : { lobbyFinalist: true };
}

/** "Round 2", "Group B · Round 2", "Final · Round 1". */
export function roundLabel(r: { stage: LobbyStage; group: number; stageRound: number; number: number }): string {
  const n = r.stageRound || r.number;
  if (r.stage === "GROUP") return `Group ${groupLetter(r.group)} · Round ${n}`;
  if (r.stage === "FINAL") return `Final · Round ${n}`;
  return `Round ${n}`;
}

/** Everyone who should hear about a lobby: each entry's user (captain) and roster. */
async function entrantUserIds(tournamentId: string, scope?: RoundScope): Promise<string[]> {
  const regs = await prisma.registration.findMany({
    where: { tournamentId, status: "CONFIRMED", ...scopeWhere(scope) },
    select: { userId: true, roster: { select: { userId: true } } },
  });
  return [...new Set(regs.flatMap((r) => [r.userId, ...r.roster.map((m) => m.userId)]))];
}

function shuffled<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The groups-then-a-final settings, or null for a single lobby. */
export function groupsConfig(t: Pick<Tournament, "lobbyGroups" | "lobbyQualifiers" | "lobbyFinalRounds">): LobbyGroupsConfig | null {
  return t.lobbyGroups && t.lobbyGroups >= 2 && t.lobbyQualifiers ? { groups: t.lobbyGroups, qualifiers: t.lobbyQualifiers, finalRounds: t.lobbyFinalRounds ?? 1 } : null;
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
  const confirmed = await prisma.registration.findMany({ where: { tournamentId, status: "CONFIRMED" }, select: { id: true } });
  if (confirmed.length < 2) return;
  const rounds = Math.max(1, tournament.lobbyRounds ?? 1);
  // Groups, then a final — unless too few registered to knock anyone out
  // of a group, in which case it plays as one lobby.
  const config = groupsConfig(tournament);
  const groups = config ? effectiveGroups(confirmed.length, config) : 1;
  const dealt = groups >= 2 ? dealGroups(shuffled(confirmed.map((r) => r.id)), groups) : null;
  const started = await prisma.$transaction(async (tx) => {
    const flipped = await tx.tournament.updateMany({
      where: { id: tournamentId, status: { notIn: ["LIVE", "COMPLETE", "CANCELLED"] } },
      data: { status: "LIVE" },
    });
    if (flipped.count === 0) return false;
    if (dealt) {
      for (let g = 1; g <= groups; g++) {
        const ids = [...dealt].filter(([, group]) => group === g).map(([id]) => id);
        await tx.registration.updateMany({ where: { id: { in: ids } }, data: { lobbyGroup: g } });
      }
      await tx.lobbyRound.createMany({
        data: Array.from({ length: groups * rounds }, (_, i) => ({
          tournamentId,
          number: i + 1,
          stage: "GROUP" as const,
          group: Math.floor(i / rounds) + 1,
          stageRound: (i % rounds) + 1,
        })),
        skipDuplicates: true,
      });
    } else {
      await tx.lobbyRound.createMany({
        data: Array.from({ length: rounds }, (_, i) => ({ tournamentId, number: i + 1, stageRound: i + 1 })),
        skipDuplicates: true,
      });
    }
    return true;
  });
  if (!started) return;
  if (dealt) {
    for (let g = 1; g <= groups; g++) {
      const users = await entrantUserIds(tournamentId, { stage: "GROUP", group: g });
      await Promise.all(
        users.map((id) => notify(id, "LOBBY_STARTED", { tournamentId, tournamentName: tournament.name, rounds: String(rounds), group: groupLetter(g) }))
      );
    }
    return;
  }
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
  /** Grouped tournaments: 1 = Group A. */
  group: number | null;
  finalist: boolean;
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
  stage: LobbyStage;
  group: number;
  stageRound: number;
  label: string;
  /** Registrations that play this round. */
  entryIds: string[];
  status: "PENDING" | "POSTED";
  postedAt: Date | null;
  proofUrl: string | null;
  results: { registrationId: string; placement: number | null; kills: number; points: number }[];
  flags: LobbyFlagView[];
};

export type LobbyView = {
  entries: LobbyEntry[];
  rounds: LobbyRoundView[];
  /** MAIN: one lobby. GROUPS: group stage running. FINAL: the final has started. */
  stage: "MAIN" | "GROUPS" | "FINAL";
  /** The leaderboard that decides the champion: the lobby's, or the final's (empty during the group stage). */
  board: LeaderboardRow[];
  groupBoards: { group: number; letter: string; entryIds: string[]; board: LeaderboardRow[] }[];
  config: LobbyGroupsConfig | null;
  table: PointsTable;
  /** Set once the tournament is COMPLETE. */
  winner: LobbyEntry | null;
};

export async function loadLobby(
  tournament: Pick<Tournament, "id" | "status" | "placementPoints" | "killPoints" | "lobbyGroups" | "lobbyQualifiers" | "lobbyFinalRounds">
): Promise<LobbyView> {
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
      group: r.lobbyGroup,
      finalist: r.lobbyFinalist,
    };
  });
  const table = tableOf(tournament);
  const inScope = (scope: RoundScope) =>
    entries
      .filter((e) => (scope.stage === "MAIN" ? true : scope.stage === "GROUP" ? e.group === scope.group : e.finalist))
      .map((e) => e.registrationId);
  const boardFor = (scope: RoundScope) =>
    buildLeaderboard(
      inScope(scope),
      rounds
        .filter((r) => r.status === "POSTED" && r.stage === scope.stage && r.group === scope.group)
        .flatMap((r) => r.results.map((x) => ({ roundNumber: r.stageRound || r.number, registrationId: x.registrationId, placement: x.placement, kills: x.kills }))),
      table
    );
  const groupNumbers = [...new Set(rounds.filter((r) => r.stage === "GROUP").map((r) => r.group))].sort((a, b) => a - b);
  const hasFinal = rounds.some((r) => r.stage === "FINAL");
  const stage: LobbyView["stage"] = groupNumbers.length === 0 ? "MAIN" : hasFinal ? "FINAL" : "GROUPS";
  const board = stage === "MAIN" ? boardFor({ stage: "MAIN", group: 0 }) : stage === "FINAL" ? boardFor({ stage: "FINAL", group: 0 }) : [];
  const winnerId = tournament.status === "COMPLETE" ? leaderboardWinner(board) : null;
  return {
    entries,
    table,
    stage,
    board,
    config: groupsConfig(tournament),
    groupBoards: groupNumbers.map((g) => ({ group: g, letter: groupLetter(g), entryIds: inScope({ stage: "GROUP", group: g }), board: boardFor({ stage: "GROUP", group: g }) })),
    winner: entries.find((e) => e.registrationId === winnerId) ?? null,
    rounds: rounds.map((r) => ({
      id: r.id,
      number: r.number,
      stage: r.stage,
      group: r.group,
      stageRound: r.stageRound || r.number,
      label: roundLabel(r),
      entryIds: inScope({ stage: r.stage, group: r.group }),
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
export async function tournamentWinnerId(
  tournament: Pick<Tournament, "id" | "status" | "competitionStyle" | "format" | "placementPoints" | "killPoints" | "lobbyGroups" | "lobbyQualifiers" | "lobbyFinalRounds">
): Promise<string | null> {
  if (tournament.status !== "COMPLETE") return null;
  if (tournament.competitionStyle === "LOBBY") {
    return (await loadLobby(tournament)).winner?.userId ?? null;
  }
  if (tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") {
    const rr = await loadLeagueStandings(tournament);
    return rr?.outcome.state === "DECIDED" ? rr.outcome.winnerId : null;
  }
  if (tournament.format === "DOUBLE_ELIMINATION") {
    const bracket = await prisma.bracket.findUnique({ where: { tournamentId: tournament.id } });
    return isDoubleElimStructure(bracket?.structure) ? bracket.structure.championId : null;
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
  if (round.stage === "GROUP" && (await prisma.lobbyRound.findFirst({ where: { tournamentId: tournament.id, stage: "FINAL" } }))) {
    throw new LobbyError("The final has started — group results are locked.", 409);
  }
  const entries = await prisma.registration.findMany({ where: { tournamentId: tournament.id, status: "CONFIRMED", ...scopeWhere(round) }, select: { id: true } });
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
    const users = await entrantUserIds(tournament.id, round);
    await Promise.all(users.map((id) => notify(id, "LOBBY_ROUND_POSTED", { tournamentId: tournament.id, tournamentName: tournament.name, round: roundLabel(round) })));
  }
}

/** Why the organizer can't finalise yet, or null if they can. */
/** Waiting flags (or a dismissal still inside its escalation window) on these rounds, or null. */
function flagBlocker(rounds: readonly LobbyRoundView[], now: Date): string | null {
  const flags = rounds.flatMap((r) => r.flags);
  if (flags.some((f) => f.status === "OPEN")) return "Answer the open flags first.";
  if (flags.some((f) => f.status === "ESCALATED")) return "A flag is with Circuit staff — wait for their answer.";
  const appealable = flags.find((f) => f.status === "DISMISSED" && !f.escalatedAt && f.resolvedAt && now.getTime() - f.resolvedAt.getTime() < FLAG_ANSWER_HOURS * HOUR);
  if (appealable) {
    const until = new Date(appealable.resolvedAt!.getTime() + FLAG_ANSWER_HOURS * HOUR);
    return `A player can still take a dismissed flag to Circuit staff until ${until.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}.`;
  }
  return null;
}

function pendingBlocker(rounds: readonly LobbyRoundView[]): string | null {
  const pending = rounds.filter((r) => r.status !== "POSTED");
  if (pending.length === 0) return null;
  const labels = pending.map((r) => r.label);
  return `Post results for ${labels.slice(0, 3).join(", ")}${labels.length > 3 ? ` and ${labels.length - 3} more` : ""} first.`;
}

/** Why the organizer can't finalise yet, or null if they can. */
export function finaliseBlocker(view: Pick<LobbyView, "rounds" | "board" | "stage">, now = new Date()): string | null {
  if (view.stage === "GROUPS") return "Finish the group stage and start the final first.";
  const deciding = view.rounds.filter((r) => r.stage !== "GROUP");
  const blocker = pendingBlocker(deciding) ?? flagBlocker(view.rounds, now);
  if (blocker) return blocker;
  if (!leaderboardWinner(view.board)) return "First place is tied on every tiebreak — check the results before finalising.";
  return null;
}

/** Why the final can't start yet, or null. Also returns who qualifies. */
export function finalBlocker(view: Pick<LobbyView, "rounds" | "groupBoards" | "stage" | "config">, now = new Date()): { blocker: string | null; finalists: string[] } {
  if (view.stage !== "GROUPS" || !view.config) return { blocker: "There's no group stage to finish.", finalists: [] };
  const groupRounds = view.rounds.filter((r) => r.stage === "GROUP");
  const blocker = pendingBlocker(groupRounds) ?? flagBlocker(groupRounds, now);
  if (blocker) return { blocker, finalists: [] };
  const finalists: string[] = [];
  for (const g of view.groupBoards) {
    const q = qualifiersFrom(g.board, view.config.qualifiers);
    if (!q) return { blocker: `Group ${g.letter} is tied on the qualification line on every tiebreak — check its results.`, finalists: [] };
    finalists.push(...q);
  }
  return { blocker: null, finalists };
}

/**
 * Ends the group stage: the top of each group become finalists and the
 * final's rounds are created (numbered after the group rounds). Points
 * start fresh in the final.
 */
export async function startFinal(tournamentId: string, actor: Actor): Promise<void> {
  const tournament = await lobbyTournament(tournamentId);
  if (!canManageLobby(actor, tournament)) throw new LobbyError("Only the organizer can start the final.", 403);
  if (tournament.status !== "LIVE") throw new LobbyError("Only a live lobby can move to the final.", 409);
  const view = await loadLobby(tournament);
  const { blocker, finalists } = finalBlocker(view);
  if (blocker) throw new LobbyError(blocker, 409);
  const rounds = view.config!.finalRounds;
  const after = Math.max(0, ...view.rounds.map((r) => r.number));
  const created = await prisma.$transaction(async (tx) => {
    if (await tx.lobbyRound.findFirst({ where: { tournamentId, stage: "FINAL" } })) return false;
    await tx.registration.updateMany({ where: { id: { in: finalists } }, data: { lobbyFinalist: true } });
    await tx.lobbyRound.createMany({
      data: Array.from({ length: rounds }, (_, i) => ({ tournamentId, number: after + i + 1, stage: "FINAL" as const, stageRound: i + 1 })),
    });
    return true;
  });
  if (!created) return;
  const inFinal = new Set(await entrantUserIds(tournamentId, { stage: "FINAL", group: 0 }));
  const everyone = await entrantUserIds(tournamentId);
  await Promise.all(
    everyone.map((id) => notify(id, "LOBBY_FINAL_SET", { tournamentId, tournamentName: tournament.name, qualified: inFinal.has(id), rounds: String(rounds) }))
  );
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
  if (round.stage === "GROUP" && (await prisma.lobbyRound.findFirst({ where: { tournamentId: tournament.id, stage: "FINAL" } }))) {
    throw new LobbyError("The final has started — group results are locked.", 409);
  }
  const inTournament = await prisma.registration.findFirst({
    where: { tournamentId: tournament.id, status: "CONFIRMED", ...scopeWhere(round), OR: [{ userId: input.user.id }, { roster: { some: { userId: input.user.id } } }] },
    select: { id: true },
  });
  if (!inTournament) throw new LobbyError("Only players in this round's lobby can flag its results.", 403);
  const existing = await prisma.lobbyFlag.findFirst({ where: { roundId: round.id, userId: input.user.id, status: { in: ["OPEN", "ESCALATED"] } } });
  if (existing) throw new LobbyError("You already have a flag waiting on this round.", 409);
  await prisma.lobbyFlag.create({ data: { roundId: round.id, userId: input.user.id, reason } });
  await notify(tournament.organizerId, "LOBBY_FLAG_RAISED", { tournamentId: tournament.id, tournamentName: tournament.name, round: roundLabel(round) });
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
    await notifyStaff("LOBBY_FLAG_ESCALATED", { tournamentId: tournament.id, tournamentName: tournament.name, round: roundLabel(flag.round) });
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
    round: roundLabel(flag.round),
    outcome: action === "resolve" ? "resolved" : "dismissed",
    byStaff: flag.status === "ESCALATED",
  });
}

// ----------------------------------------------------------- Room details

const MAX_ROOM_FIELD = 60;

export type RoomDetails = { number: number; stage: LobbyStage; group: number; roomCode: string | null; roomPassword: string | null; roomPostedAt: Date | null };

/**
 * Room details for every round. Callers must check the viewer may see
 * them first (an entrant or roster player, the organizer, or staff) —
 * loadLobby deliberately leaves them out.
 */
export async function loadRoomDetails(tournamentId: string): Promise<RoomDetails[]> {
  return prisma.lobbyRound.findMany({
    where: { tournamentId },
    orderBy: { number: "asc" },
    select: { number: true, stage: true, group: true, roomCode: true, roomPassword: true, roomPostedAt: true },
  });
}

/**
 * The organizer posts (or clears) a round's custom-room ID and password,
 * optionally for every round that hasn't been played yet. Entrants are
 * notified when details are posted or changed.
 */
export async function saveRoomDetails(input: {
  tournamentId: string;
  roundNumber: number;
  actor: Actor;
  roomCode: unknown;
  roomPassword: unknown;
  allRemaining?: unknown;
}): Promise<void> {
  const tournament = await lobbyTournament(input.tournamentId);
  if (!canManageLobby(input.actor, tournament)) throw new LobbyError("Only the organizer can post room details.", 403);
  if (tournament.status !== "LIVE") throw new LobbyError("Room details can be posted once the lobby has started.", 409);
  const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const roomCode = clean(input.roomCode);
  const roomPassword = clean(input.roomPassword);
  if ((roomCode?.length ?? 0) > MAX_ROOM_FIELD || (roomPassword?.length ?? 0) > MAX_ROOM_FIELD) {
    throw new LobbyError(`Room ID and password can be at most ${MAX_ROOM_FIELD} characters.`);
  }
  if (!roomCode && roomPassword) throw new LobbyError("Add the room ID too.");
  const round = await prisma.lobbyRound.findUnique({ where: { tournamentId_number: { tournamentId: tournament.id, number: input.roundNumber } } });
  if (!round) throw new LobbyError("That round doesn't exist.", 404);

  const targets = input.allRemaining === true
    ? await prisma.lobbyRound.findMany({
        where: { tournamentId: tournament.id, OR: [{ id: round.id }, { status: "PENDING", stage: round.stage, group: round.group, number: { gt: round.number } }] },
      })
    : [round];
  const changed = targets.filter((r) => r.roomCode !== roomCode || r.roomPassword !== roomPassword);
  if (changed.length === 0) return;
  await prisma.lobbyRound.updateMany({
    where: { id: { in: changed.map((r) => r.id) } },
    data: { roomCode, roomPassword, roomPostedAt: roomCode ? new Date() : null },
  });
  if (!roomCode) return; // cleared: nothing to announce
  const sorted = [...changed].sort((a, b) => a.number - b.number);
  const users = await entrantUserIds(tournament.id, round);
  const label = sorted.length === 1 ? roundLabel(sorted[0]) : `${roundLabel(sorted[0])} to ${roundLabel(sorted[sorted.length - 1]).replace(/^.*Round /, "round ")}`;
  await Promise.all(users.map((id) => notify(id, "LOBBY_ROOM_POSTED", { tournamentId: tournament.id, tournamentName: tournament.name, rounds: label })));
}
