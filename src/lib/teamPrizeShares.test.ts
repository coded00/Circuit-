import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { expandTeamShares } from "./prizePlaces";
import { createTestOrganizer, createTestTournament, createTestUser, cleanupAll } from "@/testHelpers";

const teamIds: string[] = [];
afterEach(async () => {
  await prisma.registration.deleteMany({ where: { teamId: { in: teamIds } } }).catch(() => undefined);
  await prisma.teamMembership.deleteMany({ where: { teamId: { in: teamIds } } });
  await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
  teamIds.length = 0;
  await cleanupAll();
});

async function teamEntry(tournamentId: string, prizeBps: number[] | null) {
  const players = await Promise.all(prizeBps ? prizeBps.map(() => createTestUser()) : [createTestUser(), createTestUser()]);
  const captain = players[0];
  const team = await prisma.team.create({ data: { name: `TEST-Team-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, captainId: captain.id } });
  teamIds.push(team.id);
  const registration = await prisma.registration.create({
    data: { tournamentId, userId: captain.id, inGameId: "cap", status: "CONFIRMED", teamId: team.id, teamName: team.name },
  });
  for (const [i, p] of players.entries()) {
    await prisma.rosterMember.create({ data: { registrationId: registration.id, userId: p.id, prizeBp: prizeBps ? prizeBps[i] : null } });
  }
  return { players, captain };
}

describe("expandTeamShares", () => {
  it("pays each roster player their own cut of the team's place, with the captain taking odd kobo", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await createTestTournament(organizer.id, { prizeAmount: 200_001 });
    const { players, captain } = await teamEntry(tournament.id, [5000, 3000, 2000]);

    const shares = await expandTeamShares(tournament.id, [{ userId: captain.id, place: 1, sharedWith: 1, amount: 200_001 }]);

    expect(shares.map((s) => s.userId)).toEqual(players.map((p) => p.id));
    expect(shares.map((s) => s.amount)).toEqual([100_001, 60_000, 40_000]);
    expect(shares.every((s) => s.place === 1)).toBe(true);
    expect(shares.reduce((a, s) => a + s.amount, 0)).toBe(200_001);
  });

  it("keeps paying the captain for an entry made before prizes were shared", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await createTestTournament(organizer.id, { prizeAmount: 100_000 });
    const { captain } = await teamEntry(tournament.id, null);

    const shares = await expandTeamShares(tournament.id, [{ userId: captain.id, place: 1, sharedWith: 1, amount: 100_000 }]);

    expect(shares).toEqual([{ userId: captain.id, place: 1, sharedWith: 1, amount: 100_000 }]);
  });

  it("leaves a solo player's share alone", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await createTestTournament(organizer.id, { prizeAmount: 50_000 });
    const solo = await createTestUser();
    await prisma.registration.create({ data: { tournamentId: tournament.id, userId: solo.id, inGameId: "solo", status: "CONFIRMED" } });
    const input = [{ userId: solo.id, place: 1, sharedWith: 1, amount: 50_000 }];
    expect(await expandTeamShares(tournament.id, input)).toEqual(input);
  });
});
