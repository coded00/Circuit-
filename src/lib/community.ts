/**
 * Circuit Community — Discord-style communities: the platform-wide
 * "Circuit" community, one per tournament, official game hubs and
 * player-made communities (see `CommunityKind` in the schema). This file
 * is the chat core (channels, messages, mentions, reactions, membership);
 * discovery lives in communityDirectory.ts, moderation and invites in
 * communityModeration.ts, pure rules in communityRules.ts.
 *
 * Real-time is polling: new messages by `since`, reaction changes and
 * removals by `reactionsSince`.
 */

import { Prisma, type Community, type CommunityKind, type CommunityRole, type MessageKind } from "@prisma/client";
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
    | "BANNED"
    | "RULES_NOT_ACCEPTED"
    | "INVITE_REQUIRED"
    | "APPLICATION_REQUIRED"
    | "MOD_ONLY"
    | "INVALID"
    | "TAKEN"
    | "LIMIT_REACHED"
    | "MUTED"
    | "SLOW_MODE"
    | "NOT_VERIFIED"
    | "THREAD_LOCKED"
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

type ChannelSeed = { key: string; name: string; modOnly?: boolean; slowModeSeconds?: number };

/** A tournament's channels. `key` is stable (system messages target
 *  "matches"/"results" by key); array order is the initial position. */
export const DEFAULT_CHANNELS: ChannelSeed[] = [
  { key: "general", name: "general" },
  { key: "announcements", name: "announcements", modOnly: true },
  { key: "matches", name: "matches" },
  { key: "results", name: "results" },
];

/** Starting channels for the Circuit community, game hubs and player communities. */
export const COMMUNITY_CHANNELS: ChannelSeed[] = [
  { key: "general", name: "general" },
  { key: "announcements", name: "announcements", modOnly: true },
  { key: "looking-for-squad", name: "looking-for-squad" },
  { key: "clips", name: "clips" },
];

/** Circuit Global: staff announcements, plus one slow-mode channel for
 *  introductions — real discussion happens in game and city communities. */
export const GLOBAL_CHANNELS: ChannelSeed[] = [
  { key: "announcements", name: "announcements", modOnly: true },
  { key: "introductions", name: "introductions", slowModeSeconds: 600 },
];

export function channelRows(communityId: string, seeds: ChannelSeed[]) {
  return seeds.map((c, i) => ({
    communityId,
    key: c.key,
    name: c.name,
    position: i,
    modOnly: c.modOnly ?? false,
    slowModeSeconds: c.slowModeSeconds ?? 0,
  }));
}

const MAX_MESSAGE_LENGTH = 2000;

/** Chat images are downscaled/re-encoded client-side before upload (see
 *  CommunityView's prepareImage), so a normal photo lands well under this;
 *  the cap mostly bounds an animated GIF, which is uploaded as-is. */
/** Kept under Vercel's 4.5MB request-body limit, which rejects larger
 *  uploads before this code runs (with a non-JSON error the client can't explain). */
export const MAX_CHAT_IMAGE_BYTES = 4 * 1024 * 1024;

type CommunityPlace = { kind: CommunityKind; slug: string | null; tournamentId: string | null };

/** Where a community lives: tournaments keep theirs under the tournament. */
export function communityHref(c: CommunityPlace): string {
  if (c.kind === "TOURNAMENT" && c.tournamentId) return `/tournaments/${c.tournamentId}/community`;
  return c.slug ? `/communities/${c.slug}` : "/communities";
}

/** Display name: its own name, or its tournament's. */
export function communityTitle(c: { name: string | null; tournament?: { name: string } | null }): string {
  return c.name ?? c.tournament?.name ?? "Community";
}

/** Creates the Community + its channels if none exists yet, or flips an
 *  existing one back to enabled — either way returns the live row. Only
 *  the tournament's organizer may call this (checked by the route). */
export async function enableCommunity(tournamentId: string) {
  const existing = await prisma.community.findUnique({ where: { tournamentId } });
  if (existing) {
    if (existing.enabled) return existing;
    return prisma.community.update({ where: { id: existing.id }, data: { enabled: true } });
  }

  return prisma.$transaction(async (tx) => {
    const community = await tx.community.create({ data: { kind: "TOURNAMENT", tournamentId, enabled: true } });
    await tx.channel.createMany({ data: channelRows(community.id, DEFAULT_CHANNELS) });
    return community;
  });
}

export async function disableCommunity(tournamentId: string) {
  const community = await prisma.community.findUnique({ where: { tournamentId } });
  if (!community) throw new CommunityError("NOT_FOUND", "This tournament has no community.");
  return prisma.community.update({ where: { id: community.id }, data: { enabled: false } });
}

export const GLOBAL_SLUG = "circuit";

/** The single platform-wide "Circuit" community every user is
 *  auto-joined to at signup. Lazily created on first use, so it also
 *  self-heals if it's ever missing. The find-then-create-in-transaction
 *  (with a second check inside it) makes a duplicate practically
 *  unreachable; the unique slug makes it impossible. */
export async function getOrCreateGlobalCommunity() {
  const existing = await prisma.community.findFirst({ where: { kind: "GLOBAL" } });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const again = await tx.community.findFirst({ where: { kind: "GLOBAL" } });
    if (again) return again;

    const community = await tx.community.create({
      data: {
        kind: "GLOBAL",
        isGlobal: true,
        enabled: true,
        slug: GLOBAL_SLUG,
        name: "Circuit",
        description: "Everyone on Circuit. Say hi, find people to play with, and keep up with what's happening.",
      },
    });
    await tx.channel.createMany({ data: channelRows(community.id, GLOBAL_CHANNELS) });
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

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

type RoleContext = Pick<Community, "id" | "kind" | "ownerId" | "tournamentId"> & { tournament?: { organizerId: string } | null };

/**
 * What someone can do here. Staff moderate every community; a
 * tournament's organizer owns its community (there's no member row for
 * that); otherwise it's the member row's role. Null = not a member.
 */
export async function effectiveRole(
  community: RoleContext,
  user: { id: string; isStaff?: boolean }
): Promise<CommunityRole | null> {
  const member = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId: community.id, userId: user.id } },
    select: { role: true },
  });
  const organizerId =
    community.kind === "TOURNAMENT"
      ? (community.tournament?.organizerId ??
        (community.tournamentId
          ? (await prisma.tournament.findUnique({ where: { id: community.tournamentId }, select: { organizerId: true } }))?.organizerId
          : undefined))
      : undefined;
  if (community.ownerId === user.id || organizerId === user.id) return "OWNER";
  if (user.isStaff) return member?.role === "OWNER" ? "OWNER" : "MODERATOR";
  return member?.role ?? null;
}

export const canModerate = (role: CommunityRole | null) => role === "OWNER" || role === "MODERATOR";

/** Loads the community and checks the caller may moderate it. */
export async function requireModerator(communityId: string, user: { id: string; isStaff?: boolean }) {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    include: { tournament: { select: { organizerId: true, name: true } } },
  });
  if (!community) throw new CommunityError("NOT_FOUND", "Community not found.");
  const role = await effectiveRole(community, user);
  if (!canModerate(role)) throw new CommunityError("FORBIDDEN", "Only this community's moderators can do that.");
  return { community, role: role! };
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export async function isBanned(communityId: string, userId: string): Promise<boolean> {
  return (await prisma.communityBan.count({ where: { communityId, userId } })) > 0;
}

/**
 * Joining directly (the Join button). Only OPEN communities (and the
 * Circuit/tournament ones) allow it: APPLY goes through an application,
 * INVITE through an invite link (communityModeration.ts). Communities
 * with rules require accepting them.
 */
export async function joinCommunity(communityId: string, userId: string, opts: { acceptRules?: boolean } = {}) {
  const community = await prisma.community.findUnique({ where: { id: communityId } });
  if (!community || !community.enabled) throw new CommunityError("DISABLED", "This community isn't open.");
  if (await isBanned(communityId, userId)) throw new CommunityError("BANNED", "You can't join this community.");

  if (community.kind === "PLAYER") {
    if (community.joinPolicy === "APPLY") throw new CommunityError("APPLICATION_REQUIRED", "This community reviews new members — apply to join.");
    if (community.joinPolicy === "INVITE") throw new CommunityError("INVITE_REQUIRED", "This community is invite-only.");
  }
  if (community.rules && !opts.acceptRules) throw new CommunityError("RULES_NOT_ACCEPTED", "Accept the community rules to join.");

  const existing = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
  if (existing) throw new CommunityError("ALREADY_MEMBER", "Already a member.");

  return prisma.communityMember.create({ data: { communityId, userId } });
}

/** Adds a member without the policy checks — for approved applications
 *  and redeemed invites, which already passed their own. Idempotent. */
export async function addMember(communityId: string, userId: string) {
  return prisma.communityMember.upsert({
    where: { communityId_userId: { communityId, userId } },
    update: {},
    create: { communityId, userId },
  });
}

export async function leaveCommunity(communityId: string, userId: string) {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
    include: { community: { select: { kind: true, ownerId: true } } },
  });
  if (!membership) throw new CommunityError("NOT_A_MEMBER", "Not a member.");
  if (membership.community.kind === "GLOBAL") throw new CommunityError("FORBIDDEN", "Everyone on Circuit is part of this community.");
  if (membership.community.ownerId === userId) {
    throw new CommunityError("FORBIDDEN", "Owners can't leave — hand ownership to someone else or delete the community first.");
  }
  await prisma.$transaction([
    prisma.communityMember.delete({ where: { id: membership.id } }),
    // A tag you can no longer wear.
    prisma.user.updateMany({ where: { id: userId, featuredCommunityId: communityId }, data: { featuredCommunityId: null } }),
  ]);
}

/** Marks everything read as of now — a single-timestamp unread signal
 *  (see `CommunityMember.lastReadAt`'s own schema comment). */
export async function markCommunityRead(communityId: string, userId: string) {
  await prisma.communityMember.updateMany({
    where: { communityId, userId },
    data: { lastReadAt: new Date() },
  });
}

/** Messages in any channel of this community newer than the member's
 *  `lastReadAt` (their own excluded). Returns 0 for a non-member. */
export async function countUnreadMessages(communityId: string, userId: string): Promise<number> {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
  if (!membership) return 0;

  return prisma.message.count({
    where: { channel: { communityId }, createdAt: { gt: membership.lastReadAt }, deletedAt: null, NOT: { authorId: userId } },
  });
}

export type JoinedCommunity = {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  kind: CommunityKind;
  isGlobal: boolean;
  iconUrl: string | null;
  tag: string | null;
  role: CommunityRole;
  unreadCount: number;
};

function communitySubtitle(c: { kind: CommunityKind; tournament?: { game: string } | null; game?: { name: string } | null; region: string | null }) {
  switch (c.kind) {
    case "GLOBAL":
      return "Everyone on Circuit";
    case "TOURNAMENT":
      return c.tournament?.game ?? "Tournament";
    case "GAME_HUB":
      return "Official game hub";
    case "OFFICIAL":
      return c.region ? `Official · ${c.region}` : "Official community";
    default:
      return [c.game?.name, c.region].filter(Boolean).join(" · ") || "Community";
  }
}

/** Unread counts for all of a user's communities in one query (each
 *  membership has its own lastReadAt, so this joins on it). */
async function unreadCounts(userId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ communityId: string; unread: number }[]>(Prisma.sql`
    SELECT cm."communityId", COUNT(m."id")::int AS unread
    FROM "CommunityMember" cm
    JOIN "Channel" ch ON ch."communityId" = cm."communityId"
    JOIN "Message" m ON m."channelId" = ch."id"
    WHERE cm."userId" = ${userId} AND m."createdAt" > cm."lastReadAt" AND m."deletedAt" IS NULL AND m."authorId" <> ${userId}
    GROUP BY cm."communityId"`);
  return new Map(rows.map((r) => [r.communityId, r.unread]));
}

/** Every community a user has joined (except disabled ones), each with
 *  its unread count. Circuit first, then most recently active. */
export async function getJoinedCommunities(userId: string): Promise<JoinedCommunity[]> {
  const [memberships, unread] = await Promise.all([prisma.communityMember.findMany({
    where: { userId, community: { enabled: true } },
    orderBy: [{ community: { isGlobal: "desc" } }, { community: { lastActivityAt: { sort: "desc", nulls: "last" } } }, { joinedAt: "desc" }],
    include: {
      community: {
        include: { tournament: { select: { id: true, name: true, game: true } }, game: { select: { name: true } } },
      },
    },
  }), unreadCounts(userId)]);

  return memberships.map((m) => {
      const c = m.community;
      return {
        id: m.communityId,
        href: communityHref(c),
        title: communityTitle(c),
        subtitle: communitySubtitle(c),
        kind: c.kind,
        isGlobal: c.kind === "GLOBAL",
        iconUrl: c.iconUrl,
        tag: c.tag,
        role: c.ownerId === userId ? "OWNER" : m.role,
        unreadCount: unread.get(m.communityId) ?? 0,
      };
    });
}

const AUTHOR_SELECT = {
  select: {
    id: true,
    displayName: true,
    handle: true,
    avatarUrl: true,
    featuredCommunity: { select: { tag: true, slug: true, enabled: true } },
  },
} as const;

/** Everything a message needs to render for a viewer: author, resolved
 *  mentions (with the mentioned user's *current* handle/name), reactions. */
const MESSAGE_INCLUDE = {
  author: AUTHOR_SELECT,
  mentions: {
    orderBy: { start: "asc" as const },
    select: { start: true, length: true, user: { select: { id: true, handle: true, displayName: true } } },
  },
  reactions: { select: { emoji: true, userId: true, createdAt: true, user: { select: { displayName: true } } } },
  replyTo: { select: { id: true, content: true, kind: true, deletedAt: true, author: { select: { displayName: true } } } },
  startedThread: { select: { id: true, title: true, messageCount: true, lastMessageAt: true, locked: true } },
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
  /** `tag`/`tagHref`: the community tag they chose to wear, if any. */
  author: { id: string; displayName: string; handle: string; avatarUrl: string | null; tag: string | null; tagHref: string | null };
  mentions: ChatMention[];
  reactions: ReactionSummary[];
  /** The message this replies to, as a one-line quote. */
  replyTo: ChatReplyQuote | null;
  pinned: boolean;
  /** The thread started from this message, if any. */
  thread: ChatThreadSummary | null;
};

export type ChatReplyQuote = { id: string; authorName: string; snippet: string; removed: boolean };
export type ChatThreadSummary = { id: string; title: string; messageCount: number; lastMessageAt: Date; locked: boolean };

function quoteOf(m: MessageWithRelations["replyTo"]): ChatReplyQuote | null {
  if (!m) return null;
  const text = m.kind === "IMAGE" ? `📷 ${m.content}`.trim() : m.kind === "STICKER" ? "Sticker" : m.content;
  return { id: m.id, authorName: m.author.displayName, snippet: m.deletedAt ? "" : text.slice(0, 120), removed: !!m.deletedAt };
}

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
    author: toChatAuthor(message.author),
    mentions: message.mentions,
    reactions: summarizeReactions(message.reactions, viewerId),
    replyTo: quoteOf(message.replyTo),
    pinned: !!message.pinnedAt,
    thread: message.startedThread,
  };
}

type AuthorRow = MessageWithRelations["author"];

function toChatAuthor({ featuredCommunity: fc, ...author }: AuthorRow): ChatMessage["author"] {
  const wearing = fc?.enabled && fc.tag ? fc : null;
  return { ...author, tag: wearing?.tag ?? null, tagHref: wearing?.slug ? `/communities/${wearing.slug}` : null };
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
/** `threadId`: read a thread instead of the channel's main feed.
 *  `aroundId`: open on an older message (search results) — returns the
 *  window around it; newer messages then arrive through the normal poll. */
export async function getChannelMessages(
  channelId: string,
  userId: string,
  cursor?: string,
  take = 50,
  opts: { threadId?: string | null; aroundId?: string } = {}
): Promise<MessageCursorPage> {
  await assertChannelMembership(channelId, userId);
  const threadId = opts.threadId ?? null;

  if (opts.aroundId && !cursor) {
    const anchor = await prisma.message.findFirst({ where: { id: opts.aroundId, channelId, threadId }, select: { createdAt: true } });
    if (anchor) {
      const half = Math.floor(take / 2);
      const [older, newer] = await Promise.all([
        prisma.message.findMany({ where: { channelId, threadId, deletedAt: null, createdAt: { lte: anchor.createdAt } }, orderBy: { createdAt: "desc" }, take: half + 1, include: MESSAGE_INCLUDE }),
        prisma.message.findMany({ where: { channelId, threadId, deletedAt: null, createdAt: { gt: anchor.createdAt } }, orderBy: { createdAt: "asc" }, take: half, include: MESSAGE_INCLUDE }),
      ]);
      const hasMore = older.length > half;
      const olderPage = hasMore ? older.slice(0, half) : older;
      return {
        messages: [...olderPage.reverse(), ...newer].map((m) => toChatMessage(m, userId)),
        nextCursor: hasMore ? olderPage[0].id : null,
      };
    }
  }

  const messages = await prisma.message.findMany({
    where: { channelId, deletedAt: null, threadId },
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

/** Changes to messages already on screen: reactions, removal (`deleted`:
 *  drop it), pinning, and the thread started from it. */
export type ReactionUpdate = { messageId: string; reactions: ReactionSummary[]; deleted?: boolean; pinned?: boolean; thread?: ChatThreadSummary | null };

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
  reactionsSince: Date | null,
  threadId: string | null = null
): Promise<{ messages: ChatMessage[]; reactionUpdates: ReactionUpdate[]; serverTime: string }> {
  await assertChannelMembership(channelId, userId);
  const serverTime = new Date();

  const [messages, changed] = await Promise.all([
    prisma.message.findMany({
      where: { channelId, threadId, createdAt: { gt: since }, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: MESSAGE_INCLUDE,
    }),
    reactionsSince
      ? prisma.message.findMany({
          where: {
            channelId,
            threadId,
            reactionsChangedAt: { gt: new Date(reactionsSince.getTime() - REACTION_POLL_OVERLAP_MS) },
            createdAt: { lte: since },
          },
          take: 100,
          select: { id: true, deletedAt: true, pinnedAt: true, reactions: MESSAGE_INCLUDE.reactions, startedThread: MESSAGE_INCLUDE.startedThread },
        })
      : Promise.resolve([]),
  ]);

  return {
    messages: messages.map((m) => toChatMessage(m, userId)),
    reactionUpdates: changed.map((m) =>
      m.deletedAt
        ? { messageId: m.id, reactions: [], deleted: true }
        : { messageId: m.id, reactions: summarizeReactions(m.reactions, userId), pinned: !!m.pinnedAt, thread: m.startedThread }
    ),
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
async function assertChannelMembership(channelId: string, userId: string): Promise<{ communityId: string; modOnly: boolean; slowModeSeconds: number; name: string }> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { communityId: true, modOnly: true, slowModeSeconds: true, name: true, community: { select: { enabled: true } } },
  });
  if (!channel) throw new CommunityError("NOT_FOUND", "Channel not found.");
  if (!channel.community.enabled) throw new CommunityError("DISABLED", "This community has been closed.");

  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId: channel.communityId, userId } },
  });
  if (!membership) throw new CommunityError("NOT_A_MEMBER", "Join the community to view this channel.");

  return channel;
}

/** The active timeout for someone in a community, if any. */
export async function activeMute(communityId: string, userId: string) {
  return prisma.communityMute.findFirst({ where: { communityId, userId, until: { gt: new Date() } }, select: { until: true, reason: true } });
}

async function assertNotMuted(communityId: string, userId: string) {
  const mute = await activeMute(communityId, userId);
  if (mute) {
    const until = mute.until.toLocaleString("en-NG", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short", timeZone: "Africa/Lagos" });
    throw new CommunityError("MUTED", `You're muted here until ${until}.`);
  }
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
    select: { kind: true, slug: true, tournamentId: true, name: true, tournament: { select: { name: true } } },
  });
  if (!community) return { href: "/communities", title: "Circuit" };
  return { href: communityHref(community), title: communityTitle(community) };
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

export async function sendMessage(
  channelId: string,
  authorId: string,
  input: SendMessageInput,
  opts: { threadId?: string | null; replyToId?: string | null } = {}
): Promise<ChatMessage> {
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
  const { communityId, modOnly: channelModOnly, slowModeSeconds, name: channelName } = await assertChannelMembership(channelId, authorId);
  await assertNotMuted(communityId, authorId);
  const threadId = opts.threadId ?? null;
  const thread = threadId ? await prisma.thread.findFirst({ where: { id: threadId, channelId } }) : null;
  if (threadId && !thread) throw new CommunityError("NOT_FOUND", "Thread not found.");
  // Threads are where the conversation happens even in announcement
  // channels; a locked thread is moderator-only.
  const modOnly = thread ? thread.locked : channelModOnly;
  if (opts.replyToId) {
    const target = await prisma.message.findFirst({ where: { id: opts.replyToId, channelId, threadId, deletedAt: null }, select: { id: true } });
    if (!target) throw new CommunityError("NOT_FOUND", "The message you're replying to is gone.");
  }
  if (modOnly || slowModeSeconds > 0) {
    const [community, author] = await Promise.all([
      prisma.community.findUniqueOrThrow({ where: { id: communityId }, include: { tournament: { select: { organizerId: true } } } }),
      prisma.user.findUniqueOrThrow({ where: { id: authorId }, select: { id: true, isStaff: true } }),
    ]);
    const isMod = canModerate(await effectiveRole(community, author));
    if (modOnly && !isMod) {
      throw thread ? new CommunityError("THREAD_LOCKED", "This thread is locked.") : new CommunityError("MOD_ONLY", "Only moderators can post in this channel.");
    }
    if (slowModeSeconds > 0 && !isMod && !thread) {
      const last = await prisma.message.findFirst({
        where: { channelId, threadId: null, authorId, deletedAt: null, createdAt: { gt: new Date(Date.now() - slowModeSeconds * 1000) } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (last) {
        const wait = Math.ceil((last.createdAt.getTime() + slowModeSeconds * 1000 - Date.now()) / 60000);
        throw new CommunityError("SLOW_MODE", `#${channelName} is in slow mode — you can post again in ${wait} min.`);
      }
    }
  }
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
      threadId,
      replyToId: opts.replyToId ?? null,
      ...(mentions.length > 0 ? { mentions: { create: mentions } } : {}),
    },
    include: { ...MESSAGE_INCLUDE, channel: { select: { key: true, name: true } } },
  });
  await prisma.community.update({ where: { id: communityId }, data: { lastActivityAt: message.createdAt } });
  if (thread) {
    await prisma.thread.update({ where: { id: thread.id }, data: { messageCount: { increment: 1 }, lastMessageAt: message.createdAt } });
    // The starter message's "N replies" line updates for channel viewers.
    if (thread.starterMessageId) await prisma.message.update({ where: { id: thread.starterMessageId }, data: { reactionsChangedAt: new Date() } });
  }

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
          href: `${location.href}?channel=${encodeURIComponent(message.channel.key)}${threadId ? `&thread=${threadId}` : ""}&message=${message.id}`,
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

  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { channelId: true, isSystem: true, deletedAt: true } });
  if (!message || message.isSystem || message.deletedAt) throw new CommunityError("NOT_FOUND", "Message not found.");
  const { communityId } = await assertChannelMembership(message.channelId, userId);
  await assertNotMuted(communityId, userId);

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
    select: { channelId: true, attachmentRef: true, deletedAt: true },
  });
  if (!message?.attachmentRef || message.deletedAt) throw new CommunityError("NOT_FOUND", "Attachment not found.");
  await assertChannelMembership(message.channelId, userId);
  return proofStorage.read(message.attachmentRef);
}

/**
 * Removes a message: its author can remove their own, moderators anyone's.
 * The row stays (content and attachment cleared) with `deletedAt` set and
 * `reactionsChangedAt` bumped, so other viewers' next poll drops it.
 */
export async function deleteMessage(messageId: string, actor: { id: string; isStaff?: boolean }) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { authorId: true, deletedAt: true, channel: { select: { community: { include: { tournament: { select: { organizerId: true } } } } } } },
  });
  if (!message || message.deletedAt) throw new CommunityError("NOT_FOUND", "Message not found.");
  if (message.authorId !== actor.id && !canModerate(await effectiveRole(message.channel.community, actor))) {
    throw new CommunityError("FORBIDDEN", "You can only remove your own messages.");
  }
  const now = new Date();
  await prisma.$transaction([
    prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: now, reactionsChangedAt: now, content: "", attachmentRef: null, stickerId: null },
    }),
    prisma.messageReaction.deleteMany({ where: { messageId } }),
    prisma.messageMention.deleteMany({ where: { messageId } }),
  ]);
}

/** Posts an automatic message (e.g. "new tournament") into a community's
 *  #announcements, falling back to its first channel. Best-effort. */
export async function postSystemMessage(communityId: string, authorId: string, content: string) {
  const channel =
    (await prisma.channel.findFirst({ where: { communityId, key: "announcements" } })) ??
    (await prisma.channel.findFirst({ where: { communityId }, orderBy: { position: "asc" } }));
  if (!channel) return;
  const message = await prisma.message.create({ data: { channelId: channel.id, authorId, content: content.slice(0, MAX_MESSAGE_LENGTH), isSystem: true } });
  await prisma.community.update({ where: { id: communityId }, data: { lastActivityAt: message.createdAt } });
}
