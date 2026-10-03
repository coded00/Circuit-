/**
 * Circuit — blocking another player. A block works in both directions for
 * the things that need two willing people: friend requests, a challenge
 * aimed at someone, accepting a challenge, Quick Match requests. It also
 * hides the blocked player's chat messages from the blocker. It does not
 * touch a match, dispute or tournament entry already under way. Blocking
 * ends any friendship between the two.
 */

import { prisma } from "@/lib/db";

export class BlockError extends Error {
  constructor(
    public code: "SELF" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "BlockError";
  }
}

/** Has either of these two players blocked the other? */
export async function blockedBetween(aId: string, bId: string): Promise<boolean> {
  if (aId === bId) return false;
  const row = await prisma.userBlock.findFirst({
    where: { OR: [{ blockerId: aId, blockedId: bId }, { blockerId: bId, blockedId: aId }] },
    select: { id: true },
  });
  return row !== null;
}

/** Has `blockerId` blocked `blockedId`? One indexed lookup, for a single pair. */
export async function hasBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const row = await prisma.userBlock.findUnique({ where: { blockerId_blockedId: { blockerId, blockedId } }, select: { id: true } });
  return row !== null;
}

/** Everyone this player blocked. */
export async function blockedByUser(userId: string): Promise<string[]> {
  const rows = await prisma.userBlock.findMany({ where: { blockerId: userId }, select: { blockedId: true } });
  return rows.map((r) => r.blockedId);
}

/** Everyone this player has a block with, whichever of them did the blocking. */
export async function blockedEitherWay(userId: string): Promise<string[]> {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [...new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)))];
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  if (blockerId === blockedId) throw new BlockError("SELF", "You can't block yourself.");
  const target = await prisma.user.findUnique({ where: { id: blockedId }, select: { id: true } });
  if (!target) throw new BlockError("NOT_FOUND", "Player not found.");
  await prisma.$transaction([
    prisma.userBlock.upsert({ where: { blockerId_blockedId: { blockerId, blockedId } }, create: { blockerId, blockedId }, update: {} }),
    // Blocking ends a friendship (or a pending request) between the two.
    prisma.friendship.deleteMany({ where: { OR: [{ requesterId: blockerId, addresseeId: blockedId }, { requesterId: blockedId, addresseeId: blockerId }] } }),
  ]);
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });
}

export async function listBlocked(userId: string) {
  const rows = await prisma.userBlock.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: "desc" },
    select: { blocked: { select: { id: true, handle: true, displayName: true, avatarUrl: true } } },
  });
  return rows.map((r) => r.blocked);
}
