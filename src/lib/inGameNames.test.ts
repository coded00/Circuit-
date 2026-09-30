import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { assertInGameNamesFree, InGameNameTakenError, normalizeInGameName, rememberInGameName, requestedInGameNames, takenInGameNames } from "./inGameNames";
import { createTestOrganizer, createTestTournament, createTestUser, cleanupAll } from "@/testHelpers";

afterEach(cleanupAll);

async function entry(tournamentId: string, inGameId: string, status: "CONFIRMED" | "PENDING_PAYMENT" | "WITHDRAWN" = "CONFIRMED", rosterNames: string[] = []) {
  const user = await createTestUser();
  const registration = await prisma.registration.create({ data: { tournamentId, userId: user.id, inGameId, status } });
  for (const name of rosterNames) {
    const member = await createTestUser();
    await prisma.rosterMember.create({ data: { registrationId: registration.id, userId: member.id, inGameId: name } });
  }
  return { user, registration };
}

describe("normalizeInGameName", () => {
  it("ignores case, outer and repeated spaces", () => {
    expect(normalizeInGameName("  Ghost   Rider ")).toBe("ghost rider");
    expect(normalizeInGameName("GHOST RIDER")).toBe("ghost rider");
  });
});

describe("in-game names are unique in a tournament", () => {
  async function setup() {
    const organizer = await createTestOrganizer();
    const tournament = await createTestTournament(organizer.id);
    const me = await createTestUser();
    return { tournament, me };
  }

  it("rejects a name a confirmed player already uses, ignoring case and spacing", async () => {
    const { tournament, me } = await setup();
    await entry(tournament.id, "Ghost Rider");
    await expect(assertInGameNamesFree(prisma, tournament.id, me.id, ["ghost  RIDER"])).rejects.toBeInstanceOf(InGameNameTakenError);
    await expect(assertInGameNamesFree(prisma, tournament.id, me.id, ["Someone Else"])).resolves.toBeUndefined();
  });

  it("counts team roster players' names too", async () => {
    const { tournament, me } = await setup();
    await entry(tournament.id, "Captain One", "CONFIRMED", ["Sniper", "Medic"]);
    await expect(assertInGameNamesFree(prisma, tournament.id, me.id, ["sniper"])).rejects.toBeInstanceOf(InGameNameTakenError);
  });

  it("holds a name for an unpaid checkout, but not for a withdrawn player", async () => {
    const { tournament, me } = await setup();
    await entry(tournament.id, "Checkout Name", "PENDING_PAYMENT");
    await entry(tournament.id, "Left Name", "WITHDRAWN");
    await expect(assertInGameNamesFree(prisma, tournament.id, me.id, ["Checkout Name"])).rejects.toBeInstanceOf(InGameNameTakenError);
    await expect(assertInGameNamesFree(prisma, tournament.id, me.id, ["Left Name"])).resolves.toBeUndefined();
    // At payment time only confirmed entries count, so a pending checkout can't block a paid one.
    expect((await takenInGameNames(prisma, tournament.id, me.id, { confirmedOnly: true })).has("checkout name")).toBe(false);
  });

  it("lets a player keep their own name when they re-register", async () => {
    const { tournament } = await setup();
    const { user } = await entry(tournament.id, "Mine");
    await expect(assertInGameNamesFree(prisma, tournament.id, user.id, ["Mine"])).resolves.toBeUndefined();
  });

  it("rejects the same name twice inside one team entry, but not the captain's roster row", async () => {
    const { tournament, me } = await setup();
    const names = requestedInGameNames("Captain", me.id, {
      members: [
        { userId: me.id, inGameId: "Captain" },
        { userId: "a", inGameId: "Dup" },
        { userId: "b", inGameId: "dup" },
      ],
    });
    expect(names).toEqual(["Captain", "Dup", "dup"]);
    await expect(assertInGameNamesFree(prisma, tournament.id, me.id, names)).rejects.toBeInstanceOf(InGameNameTakenError);
  });
});

describe("remembering a player's in-game name per game", () => {
  it("saves it, then replaces it the next time", async () => {
    const user = await createTestUser();
    const game = await prisma.game.create({ data: { name: `TEST-Game-${Date.now()}` } });
    try {
      await rememberInGameName(user.id, game.id, "First");
      await rememberInGameName(user.id, game.id, "Second");
      const rows = await prisma.userGameName.findMany({ where: { userId: user.id } });
      expect(rows.map((r) => r.name)).toEqual(["Second"]);
    } finally {
      await prisma.game.delete({ where: { id: game.id } });
    }
  });
});
