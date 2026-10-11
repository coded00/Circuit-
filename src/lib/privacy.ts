/**
 * Circuit — the two privacy settings and where they bite.
 *
 * - `searchable` false: the player doesn't appear in search or Discover. Their
 *   profile is still reachable by its link.
 * - `directChallenges`: who may send them a direct challenge, either one
 *   aimed at them or a Quick Match request. Open-board challenges are
 *   public by design and aren't affected.
 *
 * Neither explains a refusal in a way that reveals a block.
 *
 * Any query that lists players for someone to see or reach should start from
 * `reachableUsersWhere`, so the block and privacy rules live in one place
 * and a new listing can't forget them.
 */

import type { DirectChallengePolicy, Prisma } from "@prisma/client";
import { blockedBetween, blockedEitherWay } from "@/lib/blocks";
import { friendStatusBetween, getFriendIds } from "@/lib/friends";

const DIRECT_CHALLENGE_POLICIES: DirectChallengePolicy[] = ["ANYONE", "FRIENDS", "NOBODY"];

export function parseDirectPolicy(value: unknown): DirectChallengePolicy | null {
  return typeof value === "string" && (DIRECT_CHALLENGE_POLICIES as string[]).includes(value) ? (value as DirectChallengePolicy) : null;
}

/**
 * A `where` fragment for the players this viewer may be shown ("discover":
 * searchable ones) or may send a direct challenge ("challenge": those whose
 * setting admits them). Either way it leaves out anyone the viewer has a block
 * with, in both directions. Combine it with a query's own conditions using
 * `AND: [fragment, ...]`. A signed-out viewer has no blocks.
 */
export async function reachableUsersWhere(viewerId: string | null, purpose: "discover" | "challenge"): Promise<Prisma.UserWhereInput> {
  const [blocked, friendIds] = viewerId
    ? await Promise.all([blockedEitherWay(viewerId), purpose === "challenge" ? getFriendIds(viewerId) : Promise.resolve<string[]>([])])
    : [[], []];
  const notBlocked: Prisma.UserWhereInput = blocked.length > 0 ? { id: { notIn: blocked } } : {};
  if (purpose === "discover") return { searchable: true, ...notBlocked };
  // Someone who only takes direct challenges from friends is out of reach unless the viewer is one.
  return { ...notBlocked, OR: [{ directChallenges: "ANYONE" }, { directChallenges: "FRIENDS", id: { in: friendIds } }] };
}

type DirectChallengeCheck = { ok: true } | { ok: false; reason: string };

export async function canSendDirectChallenge(senderId: string, target: { id: string; directChallenges: DirectChallengePolicy }): Promise<DirectChallengeCheck> {
  const friendsOnly = target.directChallenges === "FRIENDS";
  const [blocked, friendship] = await Promise.all([blockedBetween(senderId, target.id), friendsOnly ? friendStatusBetween(senderId, target.id) : null]);
  if (blocked) return { ok: false, reason: "You can't send this player a direct challenge." };
  if (target.directChallenges === "NOBODY") return { ok: false, reason: "This player isn't taking direct challenges." };
  if (friendsOnly && friendship?.state !== "friends") return { ok: false, reason: "This player only takes direct challenges from friends." };
  return { ok: true };
}
