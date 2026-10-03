/**
 * Circuit — the conversation tools around a community's chat: threads
 * (side conversations, optionally started from a message; moderators can
 * lock them), pinned messages, message search, and the member list with
 * online status. Posting inside a thread goes through sendMessage
 * (community.ts) with a threadId.
 */

import { prisma } from "@/lib/db";
import { activeMute, canModerate, CommunityError, effectiveRole } from "@/lib/community";

type Viewer = { id: string; isStaff?: boolean };

/** Someone counts as online if their heartbeat is this recent (see PresenceHeartbeat). */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;
export const THREAD_TITLE_MAX = 80;

async function memberContext(communityId: string, viewer: Viewer) {
  const [community, member] = await Promise.all([
    prisma.community.findUnique({ where: { id: communityId }, include: { tournament: { select: { organizerId: true } } } }),
    prisma.communityMember.findUnique({ where: { communityId_userId: { communityId, userId: viewer.id } }, select: { id: true } }),
  ]);
  if (!community || !community.enabled) throw new CommunityError("NOT_FOUND", "Community not found.");
  if (!member) throw new CommunityError("NOT_A_MEMBER", "Join the community first.");
  return community;
}

async function channelContext(channelId: string, viewer: Viewer) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new CommunityError("NOT_FOUND", "Channel not found.");
  const community = await memberContext(channel.communityId, viewer);
  return { channel, community };
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export type ThreadListItem = {
  id: string;
  title: string;
  channelId: string;
  channelKey: string;
  channelName: string;
  messageCount: number;
  lastMessageAt: Date;
  locked: boolean;
};

export async function createThread(channelId: string, viewer: Viewer, input: { title?: unknown; messageId?: unknown }) {
  const { channel, community } = await channelContext(channelId, viewer);
  if (await activeMute(community.id, viewer.id)) throw new CommunityError("MUTED", "You're muted in this community.");
  if (channel.modOnly && !canModerate(await effectiveRole(community, viewer))) {
    throw new CommunityError("MOD_ONLY", "Only moderators can start threads here.");
  }

  let starterMessageId: string | null = null;
  let fallbackTitle = "";
  if (typeof input.messageId === "string" && input.messageId) {
    const starter = await prisma.message.findFirst({
      where: { id: input.messageId, channelId, threadId: null, deletedAt: null },
      select: { id: true, content: true, startedThread: { select: { id: true } } },
    });
    if (!starter) throw new CommunityError("NOT_FOUND", "That message is gone.");
    if (starter.startedThread) return prisma.thread.findUniqueOrThrow({ where: { id: starter.startedThread.id } });
    starterMessageId = starter.id;
    fallbackTitle = starter.content;
  }

  const title = (typeof input.title === "string" && input.title.trim() ? input.title : fallbackTitle).replace(/\s+/g, " ").trim().slice(0, THREAD_TITLE_MAX);
  if (title.length < 2) throw new CommunityError("INVALID", "Give the thread a title.");

  const thread = await prisma.thread.create({
    data: { channelId, communityId: community.id, title, creatorId: viewer.id, starterMessageId },
  });
  if (starterMessageId) await prisma.message.update({ where: { id: starterMessageId }, data: { reactionsChangedAt: new Date() } });
  return thread;
}

/** The community's most recently active threads (members only). */
export async function listThreads(communityId: string, viewer: Viewer, take = 15): Promise<ThreadListItem[]> {
  await memberContext(communityId, viewer);
  const threads = await prisma.thread.findMany({
    where: { communityId },
    orderBy: { lastMessageAt: "desc" },
    take,
    include: { channel: { select: { key: true, name: true } } },
  });
  return threads.map((t) => ({
    id: t.id,
    title: t.title,
    channelId: t.channelId,
    channelKey: t.channel.key,
    channelName: t.channel.name,
    messageCount: t.messageCount,
    lastMessageAt: t.lastMessageAt,
    locked: t.locked,
  }));
}

/** A thread plus what the viewer may do in it. */
export async function getThread(threadId: string, viewer: Viewer) {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      channel: { select: { id: true, key: true, name: true, communityId: true } },
      starterMessage: { select: { id: true, content: true, kind: true, deletedAt: true, createdAt: true, author: { select: { displayName: true, handle: true } } } },
    },
  });
  if (!thread) throw new CommunityError("NOT_FOUND", "Thread not found.");
  const community = await memberContext(thread.channel.communityId, viewer);
  const isMod = canModerate(await effectiveRole(community, viewer));
  return { thread, isMod, canPost: !thread.locked || isMod };
}

export async function setThreadLocked(threadId: string, viewer: Viewer, locked: boolean) {
  const { thread, isMod } = await getThread(threadId, viewer);
  if (!isMod) throw new CommunityError("FORBIDDEN", "Only moderators can lock threads.");
  await prisma.thread.update({ where: { id: thread.id }, data: { locked } });
  if (thread.starterMessageId) await prisma.message.update({ where: { id: thread.starterMessageId }, data: { reactionsChangedAt: new Date() } });
}

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

export const MAX_PINS_PER_CHANNEL = 25;

export async function setPinned(messageId: string, viewer: Viewer, pinned: boolean) {
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { id: true, channelId: true, deletedAt: true, pinnedAt: true } });
  if (!message || message.deletedAt) throw new CommunityError("NOT_FOUND", "Message not found.");
  const { community } = await channelContext(message.channelId, viewer);
  if (!canModerate(await effectiveRole(community, viewer))) throw new CommunityError("FORBIDDEN", "Only moderators can pin messages.");
  if (pinned && !message.pinnedAt) {
    const count = await prisma.message.count({ where: { channelId: message.channelId, pinnedAt: { not: null }, deletedAt: null } });
    if (count >= MAX_PINS_PER_CHANNEL) throw new CommunityError("LIMIT_REACHED", `A channel can have up to ${MAX_PINS_PER_CHANNEL} pinned messages.`);
  }
  await prisma.message.update({
    where: { id: messageId },
    data: { pinnedAt: pinned ? new Date() : null, pinnedById: pinned ? viewer.id : null, reactionsChangedAt: new Date() },
  });
}

export async function listPinned(channelId: string, viewer: Viewer) {
  await channelContext(channelId, viewer);
  const pins = await prisma.message.findMany({
    where: { channelId, pinnedAt: { not: null }, deletedAt: null },
    orderBy: { pinnedAt: "desc" },
    take: MAX_PINS_PER_CHANNEL,
    select: { id: true, content: true, kind: true, createdAt: true, threadId: true, author: { select: { displayName: true, handle: true, avatarUrl: true } } },
  });
  return pins;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchCommunityMessages(communityId: string, viewer: Viewer, query: string) {
  await memberContext(communityId, viewer);
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const results = await prisma.message.findMany({
    where: { channel: { communityId }, deletedAt: null, isSystem: false, content: { contains: q, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      content: true,
      createdAt: true,
      threadId: true,
      thread: { select: { title: true } },
      channel: { select: { id: true, key: true, name: true } },
      author: { select: { displayName: true, handle: true, avatarUrl: true } },
    },
  });
  return results;
}

// ---------------------------------------------------------------------------
// Member list
// ---------------------------------------------------------------------------

export type PresenceMember = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  role: "OWNER" | "MODERATOR" | "MEMBER";
  online: boolean;
  lastActiveAt: Date | null;
};

/** Members for the side panel: online first, then by role and recency. */
export async function listMembersWithPresence(communityId: string, viewer: Viewer, take = 200): Promise<{ members: PresenceMember[]; total: number; online: number }> {
  const community = await memberContext(communityId, viewer);
  const since = new Date(Date.now() - ONLINE_WINDOW_MS);
  const [rows, total, online] = await Promise.all([
    prisma.communityMember.findMany({
      where: { communityId },
      take,
      orderBy: [{ user: { lastActiveAt: { sort: "desc", nulls: "last" } } }],
      include: { user: { select: { id: true, handle: true, displayName: true, avatarUrl: true, lastActiveAt: true, isSuspended: true } } },
    }),
    prisma.communityMember.count({ where: { communityId } }),
    prisma.communityMember.count({ where: { communityId, user: { lastActiveAt: { gte: since } } } }),
  ]);
  const rank = { OWNER: 0, MODERATOR: 1, MEMBER: 2 } as const;
  const members = rows
    .filter((r) => !r.user.isSuspended)
    .map((r) => ({
      id: r.user.id,
      handle: r.user.handle,
      displayName: r.user.displayName,
      avatarUrl: r.user.avatarUrl,
      role: (community.ownerId === r.userId ? "OWNER" : r.role) as PresenceMember["role"],
      online: !!r.user.lastActiveAt && r.user.lastActiveAt >= since,
      lastActiveAt: r.user.lastActiveAt,
    }))
    .sort((a, b) => Number(b.online) - Number(a.online) || rank[a.role] - rank[b.role]);
  return { members, total, online };
}
