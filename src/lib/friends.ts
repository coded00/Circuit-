/**
 * Circuit — shared friendship helpers. See the `Friendship` model's own
 * schema comment for the "one row, no DECLINED state" convention this
 * all builds on.
 */

import { prisma } from "@/lib/db";

export type FriendStatus =
  | { state: "none" }
  | { state: "friends"; friendshipId: string }
  | { state: "outgoing"; friendshipId: string }
  | { state: "incoming"; friendshipId: string };

/** The relationship between `viewerId` and `otherId`, from the viewer's side. */
export async function friendStatusBetween(viewerId: string, otherId: string): Promise<FriendStatus> {
  if (viewerId === otherId) return { state: "none" };

  const row = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: viewerId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: viewerId },
      ],
    },
  });
  if (!row) return { state: "none" };
  if (row.accepted) return { state: "friends", friendshipId: row.id };
  return row.requesterId === viewerId
    ? { state: "outgoing", friendshipId: row.id }
    : { state: "incoming", friendshipId: row.id };
}

/** Every accepted friend's userId, from either side of the relationship. */
export async function getFriendIds(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: { accepted: true, OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
}

/** Real mutual-friend count between two users — set intersection of each side's accepted friends. */
export async function mutualFriendCount(aId: string, bId: string): Promise<number> {
  const [aFriends, bFriends] = await Promise.all([getFriendIds(aId), getFriendIds(bId)]);
  const bSet = new Set(bFriends);
  return aFriends.filter((id) => bSet.has(id)).length;
}
