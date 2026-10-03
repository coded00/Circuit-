import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getPlayerGameProfile, resolveGameSlug } from "./playerGameProfile";
import { createTestUser, cleanupAll } from "@/testHelpers";

afterEach(async () => {
  await cleanupAll();
});

const GAME = "Test Game";

/** A finished challenge match; `winner` undefined means it was ruled void. */
async function finished(playerAId: string, playerBId: string, winner: string | undefined, minutesAgo: number, score = "2-0") {
  const battle = await prisma.battle.create({ data: { creatorId: playerAId, game: GAME, format: "SINGLE", status: "COMPLETE" } });
  const at = new Date(Date.now() - minutesAgo * 60_000);
  return prisma.match.create({
    data: {
      battleId: battle.id,
      matchCode: `TEST-PGP-${Math.random().toString(36).slice(2, 8)}`,
      playerAId,
      playerBId,
      status: "COMPLETE",
      winnerId: winner ?? null,
      resultA: winner ? { winnerId: winner, score, submittedAt: at.toISOString() } : undefined,
      updatedAt: at,
    },
  });
}

describe("getPlayerGameProfile", () => {
  it("counts wins and losses, ignores voids, and works out the current streak and the best run", async () => {
    const me = await createTestUser();
    const rival = await createTestUser();
    // Oldest to newest: W, W, W, L, void, W, W  → latest first: W W void L W W W
    await finished(me.id, rival.id, me.id, 70);
    await finished(me.id, rival.id, me.id, 60);
    await finished(me.id, rival.id, me.id, 50);
    await finished(me.id, rival.id, rival.id, 40, "0-2");
    await finished(me.id, rival.id, undefined, 30);
    await finished(me.id, rival.id, me.id, 20);
    await finished(me.id, rival.id, me.id, 10);

    const g = await getPlayerGameProfile(me.id, GAME);
    expect(g.wins).toBe(5);
    expect(g.losses).toBe(1);
    expect(g.played).toBe(6);
    expect(g.winRate).toBe(83);
    expect(g.streak).toEqual({ result: "W", count: 2 });
    expect(g.bestWinRun).toBe(3);
    expect(g.form).toEqual(["W", "W", "L", "W", "W", "W"]);
    expect(g.matches.find((m) => m.result === "VOID")).toBeDefined();
    expect(g.matches[0].score).toBe("2-0");
  });

  it("unlocks only the achievements the numbers support", async () => {
    const me = await createTestUser();
    const rival = await createTestUser();
    await finished(me.id, rival.id, me.id, 20);
    const g = await getPlayerGameProfile(me.id, GAME);
    const unlocked = Object.fromEntries(g.achievements.map((a) => [a.key, a.unlocked]));
    expect(unlocked).toMatchObject({ "first-win": true, "five-wins": false, "hot-streak": false, "tournament-player": false });
  });

  it("keeps other games and other players out of the numbers", async () => {
    const me = await createTestUser();
    const rival = await createTestUser();
    await finished(me.id, rival.id, rival.id, 10, "0-1");
    const mine = await getPlayerGameProfile(me.id, GAME);
    const other = await getPlayerGameProfile(me.id, "Some Other Game");
    expect(mine.losses).toBe(1);
    expect(other.played).toBe(0);
    expect(other.winRate).toBeNull();
    expect(other.streak).toBeNull();
  });
});

describe("resolveGameSlug", () => {
  it("finds a game the player has played or listed, and nothing made up", async () => {
    const me = await createTestUser({ favoriteGames: ["Test Listed Game"] });
    expect(await resolveGameSlug(me.id, ["Test Listed Game"], "test-listed-game")).toBe("Test Listed Game");
    expect(await resolveGameSlug(me.id, [], "definitely-not-a-game")).toBeNull();
  });
});
