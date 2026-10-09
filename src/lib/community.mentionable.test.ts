import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { CommunityError, searchMentionableMembers } from "@/lib/community";
import { cleanupAll, createTestUser, uniqueSuffix } from "@/testHelpers";

/**
 * Finding #23 — `mentionable` skips the "community closed" gate.
 *
 * `/api/communities/[id]/mentionable` feeds the composer's @-suggestion list, and the function behind it
 * checked the viewer's membership and their own suspension but never whether the community was still
 * open. A standing member of a suspended community could therefore keep searching its membership — the
 * exact list the moderator who closed it was shutting off — while every other read of that community
 * (the member list, message search, any channel) answered NOT_FOUND.
 *
 * These drive the real function against a real community row. The client-visible half is a passthrough:
 * the route hands any CommunityError to communityErrorResponse, so the codes asserted here are what the
 * response carries.
 */

const NOT_FOUND = "Community not found.";

/** A community with a "TEST-" name, so cleanupAll() can find it again. */
async function makeCommunity(enabled: boolean) {
  const suffix = uniqueSuffix();
  return prisma.community.create({
    data: { kind: "PLAYER", name: `TEST-Community-${suffix}`, slug: `test-community-${suffix}`, enabled },
  });
}

const join = (communityId: string, userId: string) =>
  prisma.communityMember.create({ data: { communityId, userId } });

afterEach(cleanupAll);

describe("searchMentionableMembers", () => {
  it("names nobody in a community that has been closed", async () => {
    // The finding. This used to return the membership regardless of `enabled`, to a member and to a
    // stranger alike — the stranger's only obstacle was NOT_A_MEMBER, which a member never hits.
    const community = await makeCommunity(false);
    const viewer = await createTestUser();
    await join(community.id, viewer.id);

    await expect(searchMentionableMembers(community.id, viewer.id, "")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("answers the same for a closed community as for one that never existed", async () => {
    // Why NOT_FOUND and not DISABLED: that is the answer communityThreads' memberContext gives — and
    // /members and /search both go through it — so a suspended community stays indistinguishable from a
    // missing one. Sharing the code is what keeps two reads of the same community from disagreeing.
    const closed = await makeCommunity(false);
    const viewer = await createTestUser();
    await join(closed.id, viewer.id);

    const onClosed = await searchMentionableMembers(closed.id, viewer.id, "").catch((err) => err);
    const onMissing = await searchMentionableMembers("no-such-community", viewer.id, "").catch((err) => err);

    expect(onClosed).toBeInstanceOf(CommunityError);
    expect(onClosed.code).toBe("NOT_FOUND");
    expect(onClosed.message).toBe(NOT_FOUND);
    expect(onMissing.message).toBe(onClosed.message);
  });

  it("still names members while the community is open", async () => {
    // The other half of the finding's own claim: the gate is the only difference. Same shape of fixture,
    // membership rows in place, `enabled` flipped — and the search behaves exactly as it always did.
    const community = await makeCommunity(true);
    const viewer = await createTestUser();
    const other = await createTestUser();
    await join(community.id, viewer.id);
    await join(community.id, other.id);

    const found = await searchMentionableMembers(community.id, viewer.id, other.handle);

    expect(found.map((u) => u.id)).toContain(other.id);
  });

  it("still turns away a signed-in stranger", async () => {
    const community = await makeCommunity(true);
    const viewer = await createTestUser();

    await expect(searchMentionableMembers(community.id, viewer.id, "")).rejects.toMatchObject({
      code: "NOT_A_MEMBER",
    });
  });

  it("leaves suspended members out of the suggestions", async () => {
    // `mentionableWhere` has always filtered these. It is a guard rather than part of the fix, and it is
    // here so that a later refactor of the gate has something to break.
    const community = await makeCommunity(true);
    const viewer = await createTestUser();
    const suspended = await createTestUser({ isSuspended: true });
    await join(community.id, viewer.id);
    await join(community.id, suspended.id);

    const found = await searchMentionableMembers(community.id, viewer.id, suspended.handle);

    expect(found).toEqual([]);
  });
});
