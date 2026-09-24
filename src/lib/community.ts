/**
 * Circuit Community — Phase 1 (Discord-style chat attached to a
 * Tournament). Deliberately minimal: get real usage signal before
 * building reactions/roles/moderation nobody's validated wanting yet.
 * See the schema's own header comment (prisma/schema.prisma, just above
 * `model Community`) for the full reasoning, including why this has
 * nothing to do with the unrelated `CommunityPost` model.
 */

import { prisma } from "@/lib/db";

export class CommunityError extends Error {
  code: "NOT_FOUND" | "DISABLED" | "FORBIDDEN" | "NOT_A_MEMBER" | "ALREADY_MEMBER" | "EMPTY_MESSAGE" | "MESSAGE_TOO_LONG";
  constructor(code: CommunityError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "CommunityError";
  }
}

/** Fixed V1 set — see `Channel.key`'s own schema comment on why this is a
 *  string, not an enum (Phase 4 organizer-managed channels will need
 *  arbitrary ones). Order here is display order everywhere it's listed. */
export const DEFAULT_CHANNELS: { key: string; name: string }[] = [
  { key: "general", name: "general" },
  { key: "announcements", name: "announcements" },
  { key: "matches", name: "matches" },
  { key: "results", name: "results" },
];

const MAX_MESSAGE_LENGTH = 2000;

/** Creates the Community + its four fixed channels if none exists yet,
 *  or flips an existing one back to enabled — either way returns the
 *  live row. Only the tournament's organizer may call this (checked by
 *  the route, not here, same split as the rest of this codebase's
 *  lib/route boundary). */
export async function enableCommunity(tournamentId: string) {
  const existing = await prisma.community.findUnique({ where: { tournamentId } });
  if (existing) {
    if (existing.enabled) return existing;
    return prisma.community.update({ where: { id: existing.id }, data: { enabled: true } });
  }

  return prisma.$transaction(async (tx) => {
    const community = await tx.community.create({ data: { tournamentId, enabled: true } });
    await tx.channel.createMany({
      data: DEFAULT_CHANNELS.map((c) => ({ communityId: community.id, key: c.key, name: c.name })),
    });
    return community;
  });
}

export async function disableCommunity(tournamentId: string) {
  const community = await prisma.community.findUnique({ where: { tournamentId } });
  if (!community) throw new CommunityError("NOT_FOUND", "This tournament has no community.");
  return prisma.community.update({ where: { id: community.id }, data: { enabled: false } });
}

/** The single platform-wide "Circuit" community every user is
 *  auto-joined to at signup — not tied to any tournament (`tournamentId`
 *  null, `isGlobal` true). Lazily created on first use rather than a
 *  migration seed script, so it also self-heals if it's ever missing.
 *
 *  Nothing in the schema stops two rows both having `isGlobal: true` —
 *  a real DB-level "at most one" constraint needs a partial unique
 *  index Prisma can't express declaratively, and raw SQL for a single
 *  fixed row felt like more machinery than a V1 singleton needs. This
 *  find-then-create-in-transaction (with a second check inside the
 *  transaction) makes the race practically unreachable instead: two
 *  concurrent callers both missing the row on the outer check will
 *  still serialize on the transaction, and the second one finds what
 *  the first just created. */
export async function getOrCreateGlobalCommunity() {
  const existing = await prisma.community.findFirst({ where: { isGlobal: true } });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const again = await tx.community.findFirst({ where: { isGlobal: true } });
    if (again) return again;

    const community = await tx.community.create({ data: { isGlobal: true, enabled: true } });
    await tx.channel.createMany({
      data: DEFAULT_CHANNELS.map((c) => ({ communityId: community.id, key: c.key, name: c.name })),
    });
    return community;
  });
}

/** Idempotent — safe to call at signup for a brand-new user and, once,
 *  as a backfill for every account that existed before this feature
 *  shipped (see `scripts/backfill-global-community.mjs`). */
export async function joinGlobalCommunity(userId: string): Promise<void> {
  const community = await getOrCreateGlobalCommunity();
  await prisma.communityMember.upsert({
    where: { communityId_userId: { communityId: community.id, userId } },
    update: {},
    create: { communityId: community.id, userId },
  });
}

export async function joinCommunity(communityId: string, userId: string) {
  const community = await prisma.community.findUnique({ where: { id: communityId } });
  if (!community || !community.enabled) throw new CommunityError("DISABLED", "This community isn't open.");

  const existing = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
  if (existing) throw new CommunityError("ALREADY_MEMBER", "Already a member.");

  return prisma.communityMember.create({ data: { communityId, userId } });
}

export async function leaveCommunity(communityId: string, userId: string) {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
  if (!membership) throw new CommunityError("NOT_A_MEMBER", "Not a member.");
  await prisma.communityMember.delete({ where: { id: membership.id } });
}

/** Marks everything read as of now — Phase 1's single-timestamp "basic
 *  unread count" (see `CommunityMember.lastReadAt`'s own schema comment). */
export async function markCommunityRead(communityId: string, userId: string) {
  await prisma.communityMember.updateMany({
    where: { communityId, userId },
    data: { lastReadAt: new Date() },
  });
}

/** Count of messages in any channel of this community that postdate the
 *  member's `lastReadAt` — across every channel, not per-channel (same
 *  "basic" scope as `lastReadAt` itself). Returns 0 for a non-member. */
export async function countUnreadMessages(communityId: string, userId: string): Promise<number> {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
  if (!membership) return 0;

  return prisma.message.count({
    where: { channel: { communityId }, createdAt: { gt: membership.lastReadAt } },
  });
}

export type JoinedCommunity = {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  isGlobal: boolean;
  unreadCount: number;
};

/** Every community a user has joined (excluding one an organizer since
 *  disabled — nothing to read there), each with its own unread count.
 *  The platform-wide Circuit community (every user is a member — see
 *  `joinGlobalCommunity`) sorts first, then the rest by most-recently
 *  joined. One count query per membership rather than a single
 *  aggregate: a user plausibly joins a handful of communities, not
 *  hundreds, and each needs a *different* `createdAt` threshold (their
 *  own `lastReadAt`), which a single grouped query can't express anyway. */
export async function getJoinedCommunities(userId: string): Promise<JoinedCommunity[]> {
  const memberships = await prisma.communityMember.findMany({
    where: { userId, community: { enabled: true } },
    orderBy: [{ community: { isGlobal: "desc" } }, { joinedAt: "desc" }],
    include: { community: { include: { tournament: { select: { id: true, name: true, game: true } } } } },
  });

  return Promise.all(
    memberships.map(async (m) => {
      const { isGlobal, tournament } = m.community;
      return {
        id: m.communityId,
        href: isGlobal ? "/communities" : `/tournaments/${tournament!.id}/community`,
        title: isGlobal ? "Circuit" : tournament!.name,
        subtitle: isGlobal ? "Platform-wide" : tournament!.game,
        isGlobal,
        unreadCount: await countUnreadMessages(m.communityId, userId),
      };
    })
  );
}

export type CommunityListing = {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  isGlobal: boolean;
  memberCount: number;
  isMember: boolean;
  unreadCount: number;
};

/** Every enabled community on the platform, joined or not — the
 *  directory behind "View All" on the homepage's Communities card
 *  (which only lists what the viewer has already joined). Joining
 *  itself isn't done here: each community's own page already renders a
 *  join prompt for a non-member (see `CommunityView`'s `isMember`
 *  prop), so this is a read-only listing, not a join form. */
export async function getAllCommunities(userId: string): Promise<CommunityListing[]> {
  const communities = await prisma.community.findMany({
    where: { enabled: true },
    orderBy: [{ isGlobal: "desc" }, { createdAt: "desc" }],
    include: {
      tournament: { select: { id: true, name: true, game: true } },
      _count: { select: { members: true } },
      members: { where: { userId }, select: { id: true } },
    },
  });

  return Promise.all(
    communities.map(async (c) => {
      const { isGlobal, tournament } = c;
      const isMember = c.members.length > 0;
      return {
        id: c.id,
        href: isGlobal ? "/communities" : `/tournaments/${tournament!.id}/community`,
        title: isGlobal ? "Circuit" : tournament!.name,
        subtitle: isGlobal ? "Platform-wide" : tournament!.game,
        isGlobal,
        memberCount: c._count.members,
        isMember,
        unreadCount: isMember ? await countUnreadMessages(c.id, userId) : 0,
      };
    })
  );
}

export type MessageCursorPage = {
  messages: {
    id: string;
    content: string;
    createdAt: Date;
    isSystem: boolean;
    author: { id: string; displayName: string; handle: string; avatarUrl: string | null };
  }[];
  nextCursor: string | null;
};

/** Newest-first pagination, `cursor` = the oldest message id already
 *  seen by the caller (fetch older messages by passing it back). Simple
 *  cursor-on-id pagination — `createdAt` isn't unique enough alone under
 *  concurrent writes, `id` (cuid, monotonically-ish sortable) plus its
 *  own createdAt is. */
export async function getChannelMessages(channelId: string, userId: string, cursor?: string, take = 50): Promise<MessageCursorPage> {
  await assertChannelMembership(channelId, userId);

  const messages = await prisma.message.findMany({
    where: { channelId },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { author: { select: { id: true, displayName: true, handle: true, avatarUrl: true } } },
  });

  const hasMore = messages.length > take;
  const page = hasMore ? messages.slice(0, take) : messages;
  return {
    messages: page.reverse(), // oldest-first for rendering
    nextCursor: hasMore ? page[0].id : null,
  };
}

/** The polling path's own query — "what's new since I last checked,"
 *  oldest-first, uncapped (a channel realistically won't produce enough
 *  messages in one poll interval to need a limit here). */
export async function getChannelMessagesSince(channelId: string, userId: string, since: Date): Promise<MessageCursorPage["messages"]> {
  await assertChannelMembership(channelId, userId);

  return prisma.message.findMany({
    where: { channelId, createdAt: { gt: since } },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, displayName: true, handle: true, avatarUrl: true } } },
  });
}

/** Every channel action — reading messages or sending one — requires the
 *  caller to be a member of the channel's community. Reads and sends were
 *  previously checked separately (sendMessage had its own inline check,
 *  reads had none at all — a real broken-access-control bug: any
 *  authenticated user could read any channel's full history, including a
 *  tournament-restricted community they never joined, just by knowing its
 *  channelId). This is now the one shared gate both paths go through. */
async function assertChannelMembership(channelId: string, userId: string): Promise<{ communityId: string }> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { communityId: true } });
  if (!channel) throw new CommunityError("NOT_FOUND", "Channel not found.");

  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId: channel.communityId, userId } },
  });
  if (!membership) throw new CommunityError("NOT_A_MEMBER", "Join the community to view this channel.");

  return channel;
}

export async function sendMessage(channelId: string, authorId: string, content: string) {
  const trimmed = content.trim();
  if (!trimmed) throw new CommunityError("EMPTY_MESSAGE", "Message can't be empty.");
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new CommunityError("MESSAGE_TOO_LONG", `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`);
  }

  await assertChannelMembership(channelId, authorId);

  return prisma.message.create({
    data: { channelId, authorId, content: trimmed },
    include: { author: { select: { id: true, displayName: true, handle: true, avatarUrl: true } } },
  });
}
