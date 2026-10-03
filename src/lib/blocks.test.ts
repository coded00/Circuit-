import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { blockedBetween, blockedByUser, blockedEitherWay, blockUser, unblockUser, BlockError } from "./blocks";
import { canSendDirectChallenge, parseDirectPolicy } from "./privacy";
import { getEligibleRecipients } from "./quickMatch";
import { getDiscoverablePlayers } from "./discovery";
import { cancelAccountDeletion, deletionBlockers, requestAccountDeletion } from "./accountDeletion";
import { createTestUser, cleanupAll } from "@/testHelpers";

// Deletion requests alert every staff account; keep the tests from pinging real ones.
vi.mock("@/lib/notifications", async (original) => ({ ...(await original<typeof import("@/lib/notifications")>()), notifyStaff: vi.fn(async () => undefined) }));

let userIds: string[] = [];
const made = async (overrides: Parameters<typeof createTestUser>[0] = {}) => {
  const u = await createTestUser(overrides);
  userIds.push(u.id);
  return u;
};

afterEach(async () => {
  // Friendships aren't covered by the shared cleanup and hold a foreign key to the users.
  await prisma.friendship.deleteMany({ where: { OR: [{ requesterId: { in: userIds } }, { addresseeId: { in: userIds } }] } });
  userIds = [];
  await cleanupAll();
});

describe("blocking", () => {
  it("works in both directions, and unblocking lifts it", async () => {
    const [a, b, c] = [await made(), await made(), await made()];
    await blockUser(a.id, b.id);
    expect(await blockedBetween(a.id, b.id)).toBe(true);
    expect(await blockedBetween(b.id, a.id)).toBe(true);
    expect(await blockedBetween(a.id, c.id)).toBe(false);
    expect(await blockedByUser(a.id)).toEqual([b.id]);
    expect(await blockedByUser(b.id)).toEqual([]);
    expect(await blockedEitherWay(b.id)).toEqual([a.id]);

    await unblockUser(a.id, b.id);
    expect(await blockedBetween(a.id, b.id)).toBe(false);
  });

  it("ends a friendship (or a pending request) between the two", async () => {
    const [a, b] = [await made(), await made()];
    await prisma.friendship.create({ data: { requesterId: a.id, addresseeId: b.id, accepted: true } });
    await blockUser(b.id, a.id);
    expect(await prisma.friendship.count({ where: { OR: [{ requesterId: a.id }, { addresseeId: a.id }] } })).toBe(0);
  });

  it("is idempotent, and refuses blocking yourself or someone who doesn't exist", async () => {
    const [a, b] = [await made(), await made()];
    await blockUser(a.id, b.id);
    await blockUser(a.id, b.id);
    expect(await prisma.userBlock.count({ where: { blockerId: a.id } })).toBe(1);
    await expect(blockUser(a.id, a.id)).rejects.toBeInstanceOf(BlockError);
    await expect(blockUser(a.id, "no-such-user")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("direct challenges", () => {
  it("honours each policy", async () => {
    const [sender, friend] = [await made(), await made()];
    const anyone = await made();
    const friendsOnly = await made({ directChallenges: "FRIENDS" });
    const nobody = await made({ directChallenges: "NOBODY" });
    await prisma.friendship.create({ data: { requesterId: sender.id, addresseeId: friendsOnly.id, accepted: true } });

    expect((await canSendDirectChallenge(sender.id, anyone)).ok).toBe(true);
    expect((await canSendDirectChallenge(sender.id, friendsOnly)).ok).toBe(true);
    expect((await canSendDirectChallenge(friend.id, friendsOnly)).ok).toBe(false);
    expect((await canSendDirectChallenge(sender.id, nobody)).ok).toBe(false);
  });

  it("refuses a blocked pair in either direction, without saying why", async () => {
    const [a, b] = [await made(), await made()];
    await blockUser(a.id, b.id);
    for (const [from, to] of [[a, b], [b, a]] as const) {
      const r = await canSendDirectChallenge(from.id, to);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).not.toMatch(/block/i);
    }
  });

  it("parses only the three policies", () => {
    expect(parseDirectPolicy("FRIENDS")).toBe("FRIENDS");
    expect(parseDirectPolicy("everyone")).toBeNull();
  });
});

describe("Quick Match recipients", () => {
  it("leaves out blocked players and anyone who doesn't take the host's direct challenges", async () => {
    const host = await made();
    const online = { lastActiveAt: new Date() };
    const open = await made(online);
    const blockedOne = await made(online);
    const nobody = await made({ ...online, directChallenges: "NOBODY" });
    const friendsOnlyStranger = await made({ ...online, directChallenges: "FRIENDS" });
    const friendsOnlyFriend = await made({ ...online, directChallenges: "FRIENDS" });
    await prisma.friendship.create({ data: { requesterId: host.id, addresseeId: friendsOnlyFriend.id, accepted: true } });
    await blockUser(blockedOne.id, host.id);

    const ids = (await getEligibleRecipients(host.id, { stakeAmount: 0 })).map((u) => u.id);
    expect(ids).toContain(open.id);
    expect(ids).toContain(friendsOnlyFriend.id);
    expect(ids).not.toContain(blockedOne.id);
    expect(ids).not.toContain(nobody.id);
    expect(ids).not.toContain(friendsOnlyStranger.id);
  });
});

describe("Discover", () => {
  it("hides players who turned searchability off, and anyone the viewer has a block with", async () => {
    const viewer = await made();
    const shown = await made();
    const hidden = await made({ searchable: false });
    const blockedOne = await made();
    await blockUser(viewer.id, blockedOne.id);

    const { players } = await getDiscoverablePlayers({ viewerId: viewer.id, take: 200 });
    const ids = players.map((p) => p.id);
    expect(ids).toContain(shown.id);
    expect(ids).not.toContain(hidden.id);
    expect(ids).not.toContain(blockedOne.id);
  });
});

describe("account deletion request", () => {
  it("is refused while there's money in the wallet, with the reason", async () => {
    const user = await made({ walletBalance: 5_000 });
    expect(await deletionBlockers(user.id)).toEqual(["Withdraw the balance left in your wallet."]);
    const result = await requestAccountDeletion(user);
    expect(result.ok).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).deletionRequestedAt).toBeNull();
  });

  it("is refused while a challenge is open or a match is unfinished", async () => {
    const user = await made();
    const other = await made();
    await prisma.battle.create({ data: { creatorId: user.id, game: "Test Game", format: "SINGLE", status: "OPEN" } });
    expect((await deletionBlockers(user.id)).join(" ")).toMatch(/open challenges/);
    await prisma.match.create({ data: { matchCode: `TEST-DEL-${Date.now()}`, playerAId: user.id, playerBId: other.id, status: "UPCOMING" } });
    expect((await deletionBlockers(user.id)).join(" ")).toMatch(/matches in progress/);
  });

  it("can be requested when everything is settled, and taken back", async () => {
    const user = await made();
    expect(await deletionBlockers(user.id)).toEqual([]);
    expect((await requestAccountDeletion(user)).ok).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).deletionRequestedAt).not.toBeNull();
    await cancelAccountDeletion(user.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).deletionRequestedAt).toBeNull();
  });
});
