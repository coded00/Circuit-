/**
 * Circuit — what a community's page needs, shared by /communities/[slug]
 * and /tournaments/[id]/community: ordered channels, the viewer's role,
 * owner/moderator badges, upcoming hosted events, and the first channel's
 * messages (members only).
 */

import type { Community, CommunityRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { listUpcomingEvents } from "@/lib/communityEvents";
import { activeMute, canModerate, effectiveRole, getChannelMessages, type ChatMessage } from "@/lib/community";

/** Dates → ISO strings for the client boundary. */
export function serializeMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({
    ...m,
    createdAt: m.createdAt.toISOString(),
    thread: m.thread ? { ...m.thread, lastMessageAt: m.thread.lastMessageAt.toISOString() } : null,
  }));
}

type Viewer = { id: string; isStaff: boolean };

export async function loadCommunityPage(
  community: Community & { tournament?: { organizerId: string } | null },
  viewer: Viewer | null,
  opts: { channelKey?: string } = {}
) {
  const [channels, memberCount, staffRows, events, role, membership, mute, communityEvents] = await Promise.all([
    prisma.channel.findMany({ where: { communityId: community.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    prisma.communityMember.count({ where: { communityId: community.id } }),
    prisma.communityMember.findMany({
      where: { communityId: community.id, role: { in: ["OWNER", "MODERATOR"] } },
      take: 30,
      include: { user: { select: { id: true, handle: true, displayName: true, avatarUrl: true } } },
    }),
    prisma.tournament.findMany({
      where: { hostCommunityId: community.id, status: { in: ["OPEN", "CLOSED", "LIVE"] } },
      orderBy: { startAt: "asc" },
      take: 5,
      select: { id: true, name: true, startAt: true, status: true, game: true, entryFee: true, prizeAmount: true },
    }),
    viewer ? effectiveRole(community, viewer) : Promise.resolve(null),
    viewer ? prisma.communityMember.findUnique({ where: { communityId_userId: { communityId: community.id, userId: viewer.id } } }) : null,
    viewer ? activeMute(community.id, viewer.id) : null,
    community.kind === "TOURNAMENT" ? Promise.resolve([]) : listUpcomingEvents(community.id, viewer?.id ?? null),
  ]);
  const isMember = membership !== null;
  const startChannel = channels.find((c) => c.key === opts.channelKey) ?? channels[0];
  const initialMessages =
    startChannel && isMember && viewer ? await getChannelMessages(startChannel.id, viewer.id) : { messages: [], nextCursor: null };

  const roleBadges: Record<string, "OWNER" | "MODERATOR"> = {};
  for (const m of staffRows) roleBadges[m.userId] = community.ownerId === m.userId ? "OWNER" : (m.role as "OWNER" | "MODERATOR");
  if (community.ownerId) roleBadges[community.ownerId] = "OWNER";
  if (community.tournament?.organizerId) roleBadges[community.tournament.organizerId] = "OWNER";

  return {
    channels,
    memberCount,
    moderators: staffRows.map((m) => ({ ...m.user, role: (community.ownerId === m.userId ? "OWNER" : m.role) as CommunityRole })),
    events,
    role,
    isMember,
    canModerate: canModerate(role),
    startChannel,
    initialMessages: serializeMessages(initialMessages.messages),
    initialServerTime: new Date().toISOString(),
    roleBadges,
    mutedUntil: mute?.until.toISOString() ?? null,
    communityEvents,
  };
}

export type CommunityPageData = Awaited<ReturnType<typeof loadCommunityPage>>;
