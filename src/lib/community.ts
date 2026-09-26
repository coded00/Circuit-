/**
 * Circuit Community — chat attached to a Tournament (plus the global
 * Circuit community). Messages support @mentions (resolved server-side,
 * stored as MessageMention rows, notified via notify()) and emoji
 * reactions (MessageReaction rows). Real-time is the existing poll: new
 * messages by `since`, reaction changes by `reactionsSince`.
 * See the schema's own header comment (prisma/schema.prisma, just above
 * `model Community`) for the full reasoning, including why this has
 * nothing to do with the unrelated `CommunityPost` model.
 */

import type { MessageKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { findMentionCandidates, MAX_MENTIONS_PER_MESSAGE } from "@/lib/communityMentions";
import { isAllowedReaction, MAX_REACTION_TYPES_PER_MESSAGE, summarizeReactions, type ReactionSummary } from "@/lib/communityReactions";
import { proofStorage } from "@/lib/storage";
import { isSendableSticker } from "@/lib/stickers";
import { sniffImageType } from "@/lib/imageSniff";

export class CommunityError extends Error {
  code:
    | "NOT_FOUND"
    | "DISABLED"
    | "FORBIDDEN"
    | "NOT_A_MEMBER"
    | "ALREADY_MEMBER"
    | "EMPTY_MESSAGE"
    | "MESSAGE_TOO_LONG"
    | "INVALID_STICKER"
    | "INVALID_IMAGE"
    | "IMAGE_TOO_LARGE"
    | "INVALID_REACTION"
    | "TOO_MANY_REACTIONS";
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

/** Chat images are downscaled/re-encoded client-side before upload (see
 *  CommunityView's prepareImage), so a normal photo lands well under this;
 *  the cap mostly bounds an animated GIF, which is uploaded as-is. */
/** Kept under Vercel's 4.5MB request-body limit, which rejects larger
 *  uploads before this code runs (with a non-JSON error the client can't explain). */
export const MAX_CHAT_IMAGE_BYTES = 4 * 1024 * 1024;

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

const AUTHOR_SELECT = { select: { id: true, displayName: true, handle: true, avatarUrl: true } } as const;

/** Everything a message needs to render for a viewer: author, resolved
 *  mentions (with the mentioned user's *current* handle/name), reactions. */
const MESSAGE_INCLUDE = {
  author: AUTHOR_SELECT,
  mentions: {
    orderBy: { start: "asc" as const },
    select: { start: true, length: true, user: { select: { id: true, handle: true, displayName: true } } },
  },
  reactions: { select: { emoji: true, userId: true, createdAt: true, user: { select: { displayName: true } } } },
} satisfies Prisma.MessageInclude;

type MessageWithRelations = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

export type ChatMention = { start: number; length: number; user: { id: string; handle: string; displayName: string } };

/** What the client sees for a message. `attachmentRef` (a signed storage
 *  reference) never leaves the server — an IMAGE gets a URL to the
 *  membership-checked attachment route instead. Reactions are
 *  viewer-specific (`reacted`). */
export type ChatMessage = {
  id: string;
  kind: MessageKind;
  content: string;
  createdAt: Date;
  isSystem: boolean;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  stickerId: string | null;
  author: { id: string; displayName: string; handle: string; avatarUrl: string | null };
  mentions: ChatMention[];
  reactions: ReactionSummary[];
};

function toChatMessage(message: MessageWithRelations, viewerId: string): ChatMessage {
  return {
    id: message.id,
    kind: message.kind,
    content: message.content,
    createdAt: message.createdAt,
    isSystem: message.isSystem,
    imageUrl: message.kind === "IMAGE" && message.attachmentRef ? `/api/messages/${message.id}/attachment` : null,
    imageWidth: message.attachmentWidth,
    imageHeight: message.attachmentHeight,
    stickerId: message.stickerId,
    author: message.author,
    mentions: message.mentions,
    reactions: summarizeReactions(message.reactions, viewerId),
  };
}

export type MessageCursorPage = {
  messages: ChatMessage[];
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
    include: MESSAGE_INCLUDE,
  });

  const hasMore = messages.length > take;
  const page = hasMore ? messages.slice(0, take) : messages;
  return {
    messages: page.reverse().map((m) => toChatMessage(m, userId)), // oldest-first for rendering
    nextCursor: hasMore ? page[0].id : null,
  };
}

export type ReactionUpdate = { messageId: string; reactions: ReactionSummary[] };

/** Reaction changes are re-sent for this long past the previous poll.
 *  A reaction's timestamp is taken before its write commits, so a poll
 *  that reads in between would otherwise skip it for good; re-sending a
 *  message's current reactions is harmless (the client replaces them). */
const REACTION_POLL_OVERLAP_MS = 10_000;

/** The polling path's own query: messages newer than `since` (oldest-
 *  first, uncapped — a channel won't produce enough in one interval to
 *  need a limit), plus the current reactions of any older message whose
 *  reactions changed after `reactionsSince`. `serverTime` is the next
 *  `reactionsSince` — the server's clock, so client clock skew can't
 *  drop an update. */
export async function getChannelUpdates(
  channelId: string,
  userId: string,
  since: Date,
  reactionsSince: Date | null
): Promise<{ messages: ChatMessage[]; reactionUpdates: ReactionUpdate[]; serverTime: string }> {
  await assertChannelMembership(channelId, userId);
  const serverTime = new Date();

  const [messages, changed] = await Promise.all([
    prisma.message.findMany({
      where: { channelId, createdAt: { gt: since } },
      orderBy: { createdAt: "asc" },
      include: MESSAGE_INCLUDE,
    }),
    reactionsSince
      ? prisma.message.findMany({
          where: {
            channelId,
            reactionsChangedAt: { gt: new Date(reactionsSince.getTime() - REACTION_POLL_OVERLAP_MS) },
            createdAt: { lte: since },
          },
          take: 100,
          select: { id: true, reactions: MESSAGE_INCLUDE.reactions },
        })
      : Promise.resolve([]),
  ]);

  return {
    messages: messages.map((m) => toChatMessage(m, userId)),
    reactionUpdates: changed.map((m) => ({ messageId: m.id, reactions: summarizeReactions(m.reactions, userId) })),
    serverTime: serverTime.toISOString(),
  };
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

/** Who can be mentioned in a community: current members whose account
 *  isn't suspended. Anyone else's `@handle` stays plain text. */
function mentionableWhere(communityId: string): Prisma.UserWhereInput {
  return { isSuspended: false, communityMemberships: { some: { communityId } } };
}

/** Keeps only the `@handle`s in `text` that belong to a mentionable user. */
async function resolveMentions(communityId: string, text: string) {
  const candidates = findMentionCandidates(text);
  if (candidates.length === 0) return [];
  const handles = [...new Set(candidates.map((c) => c.handle))].slice(0, MAX_MENTIONS_PER_MESSAGE);
  const users = await prisma.user.findMany({
    where: { handle: { in: handles }, ...mentionableWhere(communityId) },
    select: { id: true, handle: true },
  });
  const idByHandle = new Map(users.map((u) => [u.handle, u.id]));
  return candidates
    .filter((c) => idByHandle.has(c.handle))
    .map((c) => ({ userId: idByHandle.get(c.handle)!, start: c.start, length: c.length }));
}

/** Where a community lives, for notification links. */
async function communityLocation(communityId: string) {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { isGlobal: true, tournament: { select: { id: true, name: true } } },
  });
  if (!community || community.isGlobal || !community.tournament) return { href: "/communities", title: "Circuit" };
  return { href: `/tournaments/${community.tournament.id}/community`, title: community.tournament.name };
}

/** Members matching `query` by handle or display name — the composer's
 *  @-suggestion list. Handle-prefix matches first. */
export async function searchMentionableMembers(communityId: string, viewerId: string, query: string) {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId: viewerId } },
  });
  if (!membership) throw new CommunityError("NOT_A_MEMBER", "Join the community to mention people.");

  const q = query.trim().toLowerCase().replace(/^@/, "").slice(0, 40);
  const users = await prisma.user.findMany({
    where: {
      ...mentionableWhere(communityId),
      ...(q ? { OR: [{ handle: { startsWith: q } }, { displayName: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    orderBy: [{ lastActiveAt: { sort: "desc", nulls: "last" } }, { handle: "asc" }],
    take: 20,
    select: { id: true, handle: true, displayName: true, avatarUrl: true },
  });
  return users
    .sort((a, b) => Number(!a.handle.startsWith(q)) - Number(!b.handle.startsWith(q)))
    .slice(0, 8);
}

export type SendMessageInput =
  | { kind: "TEXT"; content: string }
  | { kind: "STICKER"; stickerId: string }
  | { kind: "IMAGE"; caption: string; image: Buffer; width: number | null; height: number | null };

export async function sendMessage(channelId: string, authorId: string, input: SendMessageInput): Promise<ChatMessage> {
  const text = input.kind === "TEXT" ? input.content.trim() : input.kind === "IMAGE" ? input.caption.trim() : "";
  if (input.kind === "TEXT" && !text) throw new CommunityError("EMPTY_MESSAGE", "Message can't be empty.");
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new CommunityError("MESSAGE_TOO_LONG", `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`);
  }
  if (input.kind === "STICKER" && !isSendableSticker(input.stickerId)) {
    throw new CommunityError("INVALID_STICKER", "That sticker isn't available.");
  }

  let imageType: string | null = null;
  if (input.kind === "IMAGE") {
    if (input.image.length > MAX_CHAT_IMAGE_BYTES) {
      throw new CommunityError("IMAGE_TOO_LARGE", "Images are limited to 4MB.");
    }
    imageType = sniffImageType(input.image);
    if (!imageType) throw new CommunityError("INVALID_IMAGE", "Only JPG, PNG, GIF and WebP images can be sent.");
  }

  // Membership before storing anything — a non-member's upload should
  // never reach storage at all.
  const { communityId } = await assertChannelMembership(channelId, authorId);
  const mentions = await resolveMentions(communityId, text);

  const attachmentRef =
    input.kind === "IMAGE" && imageType ? await proofStorage.store(`chat-${channelId}`, input.image, imageType) : null;

  // Dimensions are client-measured (they only size the placeholder box
  // before the image loads) — clamp to something sane rather than trust.
  const dimension = (n: number | null) => (n && Number.isInteger(n) && n > 0 && n <= 10000 ? n : null);

  const message = await prisma.message.create({
    data: {
      channelId,
      authorId,
      kind: input.kind,
      content: text,
      stickerId: input.kind === "STICKER" ? input.stickerId : null,
      attachmentRef,
      attachmentWidth: input.kind === "IMAGE" ? dimension(input.width) : null,
      attachmentHeight: input.kind === "IMAGE" ? dimension(input.height) : null,
      ...(mentions.length > 0 ? { mentions: { create: mentions } } : {}),
    },
    include: { ...MESSAGE_INCLUDE, channel: { select: { key: true, name: true } } },
  });

  // One notification per mentioned person (never yourself), however many
  // times they're named in the message.
  const notifyIds = [...new Set(mentions.map((m) => m.userId))].filter((id) => id !== authorId);
  if (notifyIds.length > 0) {
    const location = await communityLocation(communityId);
    const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text;
    await Promise.all(
      notifyIds.map((userId) =>
        notify(userId, "COMMUNITY_MENTION", {
          messageId: message.id,
          authorName: message.author.displayName,
          channelName: message.channel.name,
          communityTitle: location.title,
          href: `${location.href}?channel=${encodeURIComponent(message.channel.key)}&message=${message.id}`,
          preview,
        })
      )
    );
  }

  return toChatMessage(message, authorId);
}

/** Turns one emoji reaction on or off for the caller. Idempotent — the
 *  (message, user, emoji) unique key makes a repeated "on" or a
 *  concurrent duplicate a no-op rather than a second row — and returns
 *  the message's resulting reactions for the caller to render. */
export async function setReaction(messageId: string, userId: string, emoji: unknown, on: boolean): Promise<ReactionUpdate> {
  if (!isAllowedReaction(emoji)) throw new CommunityError("INVALID_REACTION", "That reaction isn't available.");

  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { channelId: true, isSystem: true } });
  if (!message || message.isSystem) throw new CommunityError("NOT_FOUND", "Message not found.");
  await assertChannelMembership(message.channelId, userId);

  if (on) {
    const types = await prisma.messageReaction.findMany({ where: { messageId }, distinct: ["emoji"], select: { emoji: true } });
    if (types.length >= MAX_REACTION_TYPES_PER_MESSAGE && !types.some((t) => t.emoji === emoji)) {
      throw new CommunityError("TOO_MANY_REACTIONS", "This message has as many different reactions as it can hold.");
    }
    await prisma.messageReaction.createMany({ data: [{ messageId, userId, emoji }], skipDuplicates: true });
  } else {
    await prisma.messageReaction.deleteMany({ where: { messageId, userId, emoji } });
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { reactionsChangedAt: new Date() },
    select: { reactions: MESSAGE_INCLUDE.reactions },
  });
  return { messageId, reactions: summarizeReactions(updated.reactions, userId) };
}

/** For the attachment route: the stored image behind a message, if the
 *  requester is a member of that message's community. */
export async function getMessageAttachment(messageId: string, userId: string): Promise<{ buffer: Buffer; contentType: string }> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true, attachmentRef: true },
  });
  if (!message?.attachmentRef) throw new CommunityError("NOT_FOUND", "Attachment not found.");
  await assertChannelMembership(message.channelId, userId);
  return proofStorage.read(message.attachmentRef);
}
