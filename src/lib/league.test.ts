import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { awardLeagueResult, generateBracket, MatchError, submitResult } from "./matches";
import { DRAW_RESULT } from "./leagueTable";
import { loadLeague, isLeagueStructure } from "./leagueStandings";
import { tournamentPrizeShares } from "./prizePlaces";
import { createTestOrganizer, createTestTournament, createTestUser, cleanupAll } from "@/testHelpers";

afterEach(cleanupAll);

type Settings = { drawPoints?: number | null; legs?: 1 | 2; prize?: number };

async function league(players: number, settings: Settings = {}) {
  const organizer = await createTestOrganizer();
  const tournament = await createTestTournament(organizer.id, {
    format: "LEAGUE",
    status: "OPEN",
    leagueWinPoints: 3,
    leagueDrawPoints: settings.drawPoints === undefined ? 1 : settings.drawPoints,
    leagueLegs: settings.legs ?? 1,
    leagueMatchdayDays: 7,
    prizeAmount: settings.prize ?? null,
    prizeSplit: settings.prize ? [100] : [],
  });
  const users = [];
  for (let i = 0; i < players; i++) {
    const user = await createTestUser();
    await prisma.registration.create({ data: { tournamentId: tournament.id, userId: user.id, inGameId: `ign-${i}-${Date.now()}`, status: "CONFIRMED" } });
    users.push(user);
  }
  await generateBracket(tournament.id);
  return { organizer, tournament, users };
}

/** Both players report the same result, which completes the match. */
async function play(matchId: string, a: string, b: string, winnerId: string, score: string) {
  for (const userId of [a, b]) {
    await submitResult({ matchId, submittingUserId: userId, winnerId, score, proofBuffer: Buffer.from("proof"), proofContentType: "image/png" });
  }
}

async function matchBetween(tournamentId: string, x: string, y: string) {
  const matches = await prisma.match.findMany({ where: { tournamentId } });
  const m = matches.find((m) => [m.playerAId, m.playerBId].sort().join() === [x, y].sort().join());
  if (!m) throw new Error("no such match");
  return m;
}

describe("starting a league", () => {
  it("creates every fixture, a play-by date per matchday, and tells the players", async () => {
    const { tournament, users } = await league(4);
    const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id }, include: { bracket: true } });
    expect(t.status).toBe("LIVE");
    expect(isLeagueStructure(t.bracket?.structure) && t.bracket.structure.totalRounds).toBe(3);
    const matches = await prisma.match.findMany({ where: { tournamentId: tournament.id } });
    expect(matches).toHaveLength(6);
    expect(await prisma.notification.count({ where: { userId: users[0].id, type: "LEAGUE_STARTED" } })).toBe(1);
    const view = await loadLeague(t);
    expect(view?.deadlines).toHaveLength(3);
    expect(view?.matches.every((m) => !m.overdue)).toBe(true);
  });

  it("plays everyone twice, home and away swapped, in a double league", async () => {
    const { tournament } = await league(3, { legs: 2 });
    const matches = await prisma.match.findMany({ where: { tournamentId: tournament.id }, orderBy: { round: "asc" } });
    expect(matches).toHaveLength(6);
    expect(new Set(matches.map((m) => m.round)).size).toBe(6);
    const pairs = matches.map((m) => `${m.playerAId}>${m.playerBId}`);
    expect(new Set(pairs).size).toBe(6); // every ordered pairing once: A home to B and B home to A
  });
});

describe("draws", () => {
  it("records a draw both players report, worth a point each", async () => {
    const { tournament, users } = await league(3);
    const m = await matchBetween(tournament.id, users[0].id, users[1].id);
    await play(m.id, m.playerAId, m.playerBId, DRAW_RESULT, "1-1");
    const done = await prisma.match.findUniqueOrThrow({ where: { id: m.id } });
    expect(done).toMatchObject({ status: "COMPLETE", winnerId: null });
    const view = await loadLeague(await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } }));
    const rows = view!.table.filter((r) => [m.playerAId, m.playerBId].includes(r.entryId));
    expect(rows.map((r) => [r.draws, r.points])).toEqual([[1, 1], [1, 1]]);
  });

  it("refuses a draw when the organizer turned draws off", async () => {
    const { tournament, users } = await league(3, { drawPoints: null });
    const m = await matchBetween(tournament.id, users[0].id, users[1].id);
    await expect(
      submitResult({ matchId: m.id, submittingUserId: m.playerAId, winnerId: DRAW_RESULT, score: "1-1", proofBuffer: Buffer.from("p"), proofContentType: "image/png" })
    ).rejects.toMatchObject({ code: "INVALID_WINNER" });
  });

  it("disputes a draw against a win, like any disagreement", async () => {
    const { tournament, users } = await league(3);
    const m = await matchBetween(tournament.id, users[0].id, users[1].id);
    await submitResult({ matchId: m.id, submittingUserId: m.playerAId, winnerId: DRAW_RESULT, score: "1-1", proofBuffer: Buffer.from("p"), proofContentType: "image/png" });
    const second = await submitResult({ matchId: m.id, submittingUserId: m.playerBId, winnerId: m.playerBId, score: "2-1", proofBuffer: Buffer.from("p"), proofContentType: "image/png" });
    expect(second.outcome).toBe("DISPUTED");
  });
});

describe("finishing a league", () => {
  it("crowns the top of the table, and pays the prize to them", async () => {
    const { tournament, users } = await league(3, { prize: 100_000 });
    const [a, b, c] = users.map((u) => u.id);
    const ab = await matchBetween(tournament.id, a, b);
    const ac = await matchBetween(tournament.id, a, c);
    const bc = await matchBetween(tournament.id, b, c);
    await play(ab.id, ab.playerAId, ab.playerBId, a, "2-0");
    await play(ac.id, ac.playerAId, ac.playerBId, a, "1-0");
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } })).status).toBe("LIVE");
    await play(bc.id, bc.playerAId, bc.playerBId, DRAW_RESULT, "1-1");

    const done = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(done.status).toBe("COMPLETE");
    expect(await prisma.notification.count({ where: { userId: a, type: "TOURNAMENT_COMPLETE" } })).toBe(1);
    expect(await tournamentPrizeShares(done)).toEqual([{ userId: a, place: 1, sharedWith: 1, amount: 100_000 }]);
  });

  it("plays a decider when first place is level on everything, and it can't end in a draw", async () => {
    const { tournament, users } = await league(3);
    // Everyone beats one and loses to one by the same margin: a dead heat.
    const [a, b, c] = users.map((u) => u.id);
    const ab = await matchBetween(tournament.id, a, b);
    const bc = await matchBetween(tournament.id, b, c);
    const ca = await matchBetween(tournament.id, c, a);
    await play(ab.id, ab.playerAId, ab.playerBId, a, "1-0");
    await play(bc.id, bc.playerAId, bc.playerBId, b, "1-0");
    await play(ca.id, ca.playerAId, ca.playerBId, c, "1-0");

    const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(t.status).toBe("LIVE");
    const decider = (await prisma.match.findMany({ where: { tournamentId: t.id, round: 4 } }))[0];
    expect(decider).toBeTruthy();
    await expect(
      submitResult({ matchId: decider.id, submittingUserId: decider.playerAId, winnerId: DRAW_RESULT, score: "1-1", proofBuffer: Buffer.from("p"), proofContentType: "image/png" })
    ).rejects.toMatchObject({ code: "INVALID_WINNER" });
    await play(decider.id, decider.playerAId, decider.playerBId, decider.playerBId, "2-1");
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("COMPLETE");
  });
});

describe("organizer awards an unplayed fixture", () => {
  async function overdue(tournamentId: string) {
    const bracket = await prisma.bracket.findUniqueOrThrow({ where: { tournamentId } });
    const structure = bracket.structure as { deadlines: string[] };
    structure.deadlines = structure.deadlines.map(() => new Date(Date.now() - 60_000).toISOString());
    await prisma.bracket.update({ where: { tournamentId }, data: { structure: structure as object } });
  }

  it("waits for the deadline, then settles the fixture and counts it in the table", async () => {
    const { organizer, tournament, users } = await league(3);
    const m = await matchBetween(tournament.id, users[0].id, users[1].id);
    await expect(awardLeagueResult({ matchId: m.id, organizerId: organizer.id, outcome: m.playerAId })).rejects.toBeInstanceOf(MatchError);

    await overdue(tournament.id);
    await expect(awardLeagueResult({ matchId: m.id, organizerId: users[2].id, outcome: m.playerAId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await awardLeagueResult({ matchId: m.id, organizerId: organizer.id, outcome: m.playerAId });

    const done = await prisma.match.findUniqueOrThrow({ where: { id: m.id } });
    expect(done).toMatchObject({ status: "COMPLETE", winnerId: m.playerAId });
    const view = await loadLeague(await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } }));
    expect(view!.table.find((r) => r.entryId === m.playerAId)).toMatchObject({ wins: 1, points: 3, gf: 3, ga: 0 });
    expect(view!.matches.find((x) => x.id === m.id)!.overdue).toBe(false);
    expect(view!.matches.filter((x) => x.overdue)).toHaveLength(2);
    expect(await prisma.notification.count({ where: { userId: m.playerAId, type: "LEAGUE_RESULT_AWARDED" } })).toBe(1);
  });

  it("can award a draw only where draws are allowed", async () => {
    const { organizer, tournament, users } = await league(3, { drawPoints: null });
    const m = await matchBetween(tournament.id, users[0].id, users[1].id);
    await overdue(tournament.id);
    await expect(awardLeagueResult({ matchId: m.id, organizerId: organizer.id, outcome: DRAW_RESULT })).rejects.toMatchObject({ code: "INVALID_WINNER" });
  });
});
