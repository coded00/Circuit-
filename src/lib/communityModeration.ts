/**
 * Circuit — running a community: roles, removing/banning members,
 * applications (APPLY communities), invite links, channels, the tag
 * players wear, and closing a community. Every function takes the acting
 * user and checks their role itself (effectiveRole in community.ts):
 * owners manage moderators, moderators manage members, staff can step in
 * anywhere.
 */

import type { CommunityRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import {
  addMember,
  canModerate,
  CommunityError,
  communityHref,
  communityTitle,
  effectiveRole,
  isBanned,
  requireModerator,
} from "@/lib/community";
import {
  APPLICATION_ANSWER_MAX,
  generateInviteCode,
  inviteProblem,
  MAX_CHANNELS,
  normalizeChannelName,
} from "@/lib/communityRules";

type Actor = { id: string; isStaff?: boolean };

/** Higher outranks lower. Staff sit between moderators and the owner. */
function rank(role: CommunityRole | null, isStaff = false): number {
  if (role === "OWNER") return 4;
  if (isStaff) return 3;
  if (role === "MODERATOR") return 2;
  return role === "MEMBER" ? 1 : 0;
}

async function loadCommunity(communityId: string) {
  const community = await prisma.community.findUnique({ where: { id: communityId }, include: { tournament: { select: { organizerId: true, name: true } } } });
  if (!community) throw new CommunityError("NOT_FOUND", "Community not found.");
  return community;
}

async function targetRole(communityId: string, userId: string, ownerId: string | null) {
  if (ownerId === userId) return "OWNER" as const;
  const member = await prisma.communityMember.findUnique({ where: { communityId_userId: { communityId, userId } }, select: { role: true } });
  return member?.role ?? null;
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export type MemberRow = {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  role: CommunityRole;
  joinedAt: Date;
};

export async function listMembers(communityId: string, q?: string): Promise<MemberRow[]> {
  const community = await loadCommunity(communityId);
  const query = q?.trim().replace(/^@/, "").slice(0, 40);
  const members = await prisma.communityMember.findMany({
    where: {
      communityId,
      ...(query ? { user: { OR: [{ handle: { contains: query.toLowerCase() } }, { displayName: { contains: query, mode: "insensitive" } }] } } : {}),
    },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    take: 200,
    include: { user: { select: { handle: true, displayName: true, avatarUrl: true } } },
  });
  return members.map((m) => ({
    userId: m.userId,
    handle: m.user.handle,
    displayName: m.user.displayName,
    avatarUrl: m.user.avatarUrl,
    role: community.ownerId === m.userId ? "OWNER" : m.role,
    joinedAt: m.joinedAt,
  }));
}

/** Owner-only: make someone a moderator or back to a member. */
export async function setMemberRole(communityId: string, actor: Actor, userId: string, role: "MODERATOR" | "MEMBER") {
  const community = await loadCommunity(communityId);
  const actorRole = await effectiveRole(community, actor);
  if (actorRole !== "OWNER" && !actor.isStaff) throw new CommunityError("FORBIDDEN", "Only the owner can change roles.");
  if (community.ownerId === userId) throw new CommunityError("FORBIDDEN", "The owner's role can't be changed.");
  const updated = await prisma.communityMember.updateMany({ where: { communityId, userId }, data: { role } });
  if (updated.count === 0) throw new CommunityError("NOT_A_MEMBER", "They're not a member.");
}

/** Owner-only (player communities): hand the community to another member. */
export async function transferOwnership(communityId: string, actor: Actor, userId: string) {
  const community = await loadCommunity(communityId);
  if (community.kind !== "PLAYER") throw new CommunityError("FORBIDDEN", "Only player communities can change owner.");
  if (community.ownerId !== actor.id) throw new CommunityError("FORBIDDEN", "Only the owner can do that.");
  const member = await prisma.communityMember.findUnique({ where: { communityId_userId: { communityId, userId } } });
  if (!member) throw new CommunityError("NOT_A_MEMBER", "They need to be a member first.");
  await prisma.$transaction([
    prisma.community.update({ where: { id: communityId }, data: { ownerId: userId } }),
    prisma.communityMember.update({ where: { id: member.id }, data: { role: "OWNER" } }),
    prisma.communityMember.updateMany({ where: { communityId, userId: actor.id }, data: { role: "MODERATOR" } }),
  ]);
}

/** Removes a member (optionally banning them). You can only remove people
 *  you outrank; the owner can never be removed. */
export async function removeMember(communityId: string, actor: Actor, userId: string, opts: { ban?: boolean; reason?: string } = {}) {
  const community = await loadCommunity(communityId);
  if (community.kind === "GLOBAL" && !actor.isStaff) throw new CommunityError("FORBIDDEN", "Only staff can remove people from Circuit.");
  if (userId === actor.id) throw new CommunityError("FORBIDDEN", "Use Leave instead.");
  const [actorRole, theirRole] = await Promise.all([effectiveRole(community, actor), targetRole(communityId, userId, community.ownerId)]);
  if (!canModerate(actorRole)) throw new CommunityError("FORBIDDEN", "Only moderators can remove members.");
  if (theirRole === "OWNER" || rank(theirRole) >= rank(actorRole, actor.isStaff)) {
    throw new CommunityError("FORBIDDEN", "You can't remove someone with the same or a higher role.");
  }
  await prisma.$transaction([
    prisma.communityMember.deleteMany({ where: { communityId, userId } }),
    prisma.user.updateMany({ where: { id: userId, featuredCommunityId: communityId }, data: { featuredCommunityId: null } }),
    ...(opts.ban
      ? [
          prisma.communityBan.upsert({
            where: { communityId_userId: { communityId, userId } },
            update: { reason: opts.reason?.slice(0, 200) ?? null, bannedById: actor.id },
            create: { communityId, userId, bannedById: actor.id, reason: opts.reason?.slice(0, 200) ?? null },
          }),
          prisma.communityApplication.deleteMany({ where: { communityId, userId } }),
        ]
      : []),
  ]);
}

export const MUTE_DURATIONS_HOURS = [1, 24, 168] as const;

/** Timeout: they keep reading but can't post or react. Same rank rules as removing. */
export async function muteMember(communityId: string, actor: Actor, userId: string, hours: number, reason?: string) {
  if (!MUTE_DURATIONS_HOURS.includes(hours as (typeof MUTE_DURATIONS_HOURS)[number])) throw new CommunityError("INVALID", "Pick 1 hour, 24 hours or 7 days.");
  const community = await loadCommunity(communityId);
  const [actorRole, theirRole] = await Promise.all([effectiveRole(community, actor), targetRole(communityId, userId, community.ownerId)]);
  if (!canModerate(actorRole)) throw new CommunityError("FORBIDDEN", "Only moderators can mute members.");
  if (!theirRole) throw new CommunityError("NOT_A_MEMBER", "They're not a member.");
  if (theirRole === "OWNER" || rank(theirRole) >= rank(actorRole, actor.isStaff)) {
    throw new CommunityError("FORBIDDEN", "You can't mute someone with the same or a higher role.");
  }
  const until = new Date(Date.now() + hours * 3600_000);
  await prisma.communityMute.upsert({
    where: { communityId_userId: { communityId, userId } },
    update: { until, mutedById: actor.id, reason: reason?.slice(0, 200) ?? null },
    create: { communityId, userId, until, mutedById: actor.id, reason: reason?.slice(0, 200) ?? null },
  });
  return until;
}

export async function unmuteMember(communityId: string, actor: Actor, userId: string) {
  await requireModerator(communityId, actor);
  await prisma.communityMute.deleteMany({ where: { communityId, userId } });
}

export async function listBans(communityId: string) {
  return prisma.communityBan.findMany({
    where: { communityId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { handle: true, displayName: true, avatarUrl: true } } },
  });
}

export async function unban(communityId: string, actor: Actor, userId: string) {
  await requireModerator(communityId, actor);
  await prisma.communityBan.deleteMany({ where: { communityId, userId } });
}

// ---------------------------------------------------------------------------
// Applications (APPLY communities)
// ---------------------------------------------------------------------------

export async function applyToCommunity(communityId: string, userId: string, input: { answer?: unknown; acceptRules?: unknown }) {
  const community = await loadCommunity(communityId);
  if (!community.enabled) throw new CommunityError("DISABLED", "This community isn't open.");
  if (community.joinPolicy !== "APPLY" || community.kind !== "PLAYER") throw new CommunityError("INVALID", "This community doesn't take applications.");
  if (await isBanned(communityId, userId)) throw new CommunityError("BANNED", "You can't join this community.");
  if (await prisma.communityMember.count({ where: { communityId, userId } })) throw new CommunityError("ALREADY_MEMBER", "Already a member.");
  if (community.rules && input.acceptRules !== true) throw new CommunityError("RULES_NOT_ACCEPTED", "Accept the community rules to apply.");
  const answer = typeof input.answer === "string" ? input.answer.trim() : "";
  if (community.applicationQuestion && !answer) throw new CommunityError("INVALID", "Answer the question to apply.");
  if (answer.length > APPLICATION_ANSWER_MAX) throw new CommunityError("INVALID", `Keep your answer under ${APPLICATION_ANSWER_MAX} characters.`);

  const existing = await prisma.communityApplication.findUnique({ where: { communityId_userId: { communityId, userId } } });
  if (existing?.status === "PENDING") throw new CommunityError("TAKEN", "Your application is already waiting for review.");
  await prisma.communityApplication.upsert({
    where: { communityId_userId: { communityId, userId } },
    update: { answer, status: "PENDING", reviewedAt: null, reviewedById: null, createdAt: new Date() },
    create: { communityId, userId, answer },
  });

  const [applicant, mods] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } }),
    prisma.communityMember.findMany({ where: { communityId, role: { in: ["OWNER", "MODERATOR"] } }, select: { userId: true } }),
  ]);
  const recipients = new Set([...mods.map((m) => m.userId), ...(community.ownerId ? [community.ownerId] : [])]);
  await Promise.all(
    [...recipients].map((id) =>
      notify(id, "COMMUNITY_APPLICATION", {
        applicantName: applicant?.displayName ?? "Someone",
        communityTitle: communityTitle(community),
        href: `${communityHref(community)}/settings?tab=applications`,
      })
    )
  );
}

export async function listApplications(communityId: string) {
  return prisma.communityApplication.findMany({
    where: { communityId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, handle: true, displayName: true, avatarUrl: true } } },
  });
}

export async function reviewApplication(applicationId: string, actor: Actor, approve: boolean) {
  const application = await prisma.communityApplication.findUnique({ where: { id: applicationId } });
  if (!application || application.status !== "PENDING") throw new CommunityError("NOT_FOUND", "That application was already handled.");
  const { community } = await requireModerator(application.communityId, actor);
  await prisma.communityApplication.update({
    where: { id: applicationId },
    data: { status: approve ? "APPROVED" : "REJECTED", reviewedById: actor.id, reviewedAt: new Date() },
  });
  if (!approve) return;
  if (await isBanned(community.id, application.userId)) return;
  await addMember(community.id, application.userId);
  await notify(application.userId, "COMMUNITY_APPLICATION_APPROVED", {
    communityTitle: communityTitle(community),
    href: communityHref(community),
  });
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

/** Members can invite to OPEN/APPLY communities; invite-only ones need a moderator. */
export async function createInvite(communityId: string, actor: Actor, opts: { expiresInHours?: unknown; maxUses?: unknown }) {
  const community = await loadCommunity(communityId);
  if (!community.enabled || community.kind === "TOURNAMENT" || community.kind === "GLOBAL") {
    throw new CommunityError("INVALID", "This community doesn't use invite links.");
  }
  const role = await effectiveRole(community, actor);
  if (!role) throw new CommunityError("NOT_A_MEMBER", "Join the community first.");
  if (community.joinPolicy === "INVITE" && !canModerate(role)) throw new CommunityError("FORBIDDEN", "Only moderators can invite people here.");

  const hours = Number(opts.expiresInHours);
  const uses = Number(opts.maxUses);
  const expiresAt = [1, 24, 24 * 7].includes(hours) ? new Date(Date.now() + hours * 3600_000) : null;
  const maxUses = [1, 5, 10, 25, 100].includes(uses) ? uses : null;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.communityInvite.create({ data: { code: generateInviteCode(), communityId, createdById: actor.id, expiresAt, maxUses } });
    } catch {
      // Code collision (vanishingly rare) — try another.
    }
  }
  throw new CommunityError("INVALID", "Couldn't create an invite. Try again.");
}

export async function listInvites(communityId: string, actor: Actor) {
  const community = await loadCommunity(communityId);
  const role = await effectiveRole(community, actor);
  const invites = await prisma.communityInvite.findMany({
    where: { communityId, revokedAt: null, ...(canModerate(role) ? {} : { createdById: actor.id }) },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { createdBy: { select: { handle: true } } },
  });
  return invites.filter((i) => !inviteProblem(i));
}

export async function revokeInvite(inviteId: string, actor: Actor) {
  const invite = await prisma.communityInvite.findUnique({ where: { id: inviteId } });
  if (!invite) throw new CommunityError("NOT_FOUND", "Invite not found.");
  if (invite.createdById !== actor.id) await requireModerator(invite.communityId, actor);
  await prisma.communityInvite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
}

/** What the /invite page shows. Null when the code doesn't exist. */
export async function resolveInvite(code: string) {
  const invite = await prisma.communityInvite.findUnique({
    where: { code },
    include: {
      createdBy: { select: { displayName: true } },
      community: { include: { game: { select: { name: true } }, _count: { select: { members: true } } } },
    },
  });
  if (!invite) return null;
  const problem = invite.community.enabled ? inviteProblem(invite) : ("closed" as const);
  return { invite, community: invite.community, problem };
}

/** Joins via an invite. Invites bypass the join policy (that's their
 *  point) but never a ban, and rules still have to be accepted. */
export async function redeemInvite(code: string, userId: string, acceptRules: boolean) {
  const resolved = await resolveInvite(code);
  if (!resolved) throw new CommunityError("NOT_FOUND", "This invite link doesn't exist.");
  const { invite, community, problem } = resolved;
  if (problem) throw new CommunityError("INVALID", problem === "closed" ? "This community has closed." : "This invite has expired.");
  if (await isBanned(community.id, userId)) throw new CommunityError("BANNED", "You can't join this community.");
  if (await prisma.communityMember.count({ where: { communityId: community.id, userId } })) return community;
  if (community.rules && !acceptRules) throw new CommunityError("RULES_NOT_ACCEPTED", "Accept the community rules to join.");

  // Claim a use atomically so a limited invite can't be over-redeemed.
  const claimed = await prisma.communityInvite.updateMany({
    where: { id: invite.id, revokedAt: null, ...(invite.maxUses !== null ? { uses: { lt: invite.maxUses } } : {}) },
    data: { uses: { increment: 1 } },
  });
  if (claimed.count === 0) throw new CommunityError("INVALID", "This invite has expired.");
  await addMember(community.id, userId);
  await prisma.communityApplication.deleteMany({ where: { communityId: community.id, userId, status: "PENDING" } });
  return community;
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/** Channel keys the platform posts into — they can be renamed, not deleted. */
const SYSTEM_CHANNEL_KEYS = new Set(["general", "announcements", "matches", "results"]);

export async function createChannel(communityId: string, actor: Actor, input: { name?: unknown; modOnly?: unknown }) {
  await requireModerator(communityId, actor);
  const name = typeof input.name === "string" ? normalizeChannelName(input.name) : null;
  if (!name) throw new CommunityError("INVALID", "Channel names need at least 2 letters or numbers.");
  const channels = await prisma.channel.findMany({ where: { communityId }, select: { key: true, name: true, position: true } });
  if (channels.length >= MAX_CHANNELS) throw new CommunityError("LIMIT_REACHED", `Communities can have up to ${MAX_CHANNELS} channels.`);
  if (channels.some((c) => c.name === name || c.key === name)) throw new CommunityError("TAKEN", "There's already a channel with that name.");
  return prisma.channel.create({
    data: { communityId, key: name, name, modOnly: input.modOnly === true, position: Math.max(-1, ...channels.map((c) => c.position)) + 1 },
  });
}

export async function updateChannel(channelId: string, actor: Actor, input: { name?: unknown; modOnly?: unknown; move?: unknown }) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new CommunityError("NOT_FOUND", "Channel not found.");
  await requireModerator(channel.communityId, actor);

  if (input.move === "up" || input.move === "down") {
    const siblings = await prisma.channel.findMany({ where: { communityId: channel.communityId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
    const i = siblings.findIndex((c) => c.id === channelId);
    const j = input.move === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= siblings.length) return channel;
    const order = [...siblings];
    [order[i], order[j]] = [order[j], order[i]];
    await prisma.$transaction(order.map((c, position) => prisma.channel.update({ where: { id: c.id }, data: { position } })));
    return channel;
  }

  const data: { name?: string; modOnly?: boolean } = {};
  if (input.name !== undefined) {
    const name = typeof input.name === "string" ? normalizeChannelName(input.name) : null;
    if (!name) throw new CommunityError("INVALID", "Channel names need at least 2 letters or numbers.");
    const clash = await prisma.channel.findFirst({ where: { communityId: channel.communityId, name, NOT: { id: channelId } } });
    if (clash) throw new CommunityError("TAKEN", "There's already a channel with that name.");
    data.name = name;
  }
  if (typeof input.modOnly === "boolean") data.modOnly = input.modOnly;
  return prisma.channel.update({ where: { id: channelId }, data });
}

export async function deleteChannel(channelId: string, actor: Actor) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new CommunityError("NOT_FOUND", "Channel not found.");
  await requireModerator(channel.communityId, actor);
  if (SYSTEM_CHANNEL_KEYS.has(channel.key)) throw new CommunityError("FORBIDDEN", `#${channel.name} is built in — rename it instead.`);
  // Reactions and mentions cascade from their message.
  await prisma.$transaction([prisma.message.deleteMany({ where: { channelId } }), prisma.channel.delete({ where: { id: channelId } })]);
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

/** A team captain adds their team to a community they belong to. */
export async function addTeamToCommunity(communityId: string, actor: Actor, teamId: string) {
  const [community, team] = await Promise.all([loadCommunity(communityId), prisma.team.findUnique({ where: { id: teamId } })]);
  if (!team) throw new CommunityError("NOT_FOUND", "Team not found.");
  if (team.captainId !== actor.id) throw new CommunityError("FORBIDDEN", "Only the team captain can add the team.");
  if (!community.enabled || community.kind === "GLOBAL" || community.kind === "TOURNAMENT") throw new CommunityError("INVALID", "Teams can't be added here.");
  if (!(await prisma.communityMember.count({ where: { communityId, userId: actor.id } }))) throw new CommunityError("NOT_A_MEMBER", "Join the community first.");
  if (await isBanned(communityId, actor.id)) throw new CommunityError("BANNED", "You can't add a team here.");
  await prisma.communityTeam.upsert({
    where: { communityId_teamId: { communityId, teamId } },
    update: {},
    create: { communityId, teamId, addedById: actor.id },
  });
}

/** The captain, or the community's moderators, take a team off a community. */
export async function removeTeamFromCommunity(communityId: string, actor: Actor, teamId: string) {
  const [community, team] = await Promise.all([loadCommunity(communityId), prisma.team.findUnique({ where: { id: teamId } })]);
  if (!team) throw new CommunityError("NOT_FOUND", "Team not found.");
  if (team.captainId !== actor.id && !canModerate(await effectiveRole(community, actor))) {
    throw new CommunityError("FORBIDDEN", "Only the captain or a moderator can remove this team.");
  }
  await prisma.communityTeam.deleteMany({ where: { communityId, teamId } });
}

export async function listCommunityTeams(communityId: string) {
  const rows = await prisma.communityTeam.findMany({
    where: { communityId },
    orderBy: { createdAt: "asc" },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          tag: true,
          game: true,
          captainId: true,
          _count: { select: { members: { where: { accepted: true } } } },
        },
      },
    },
  });
  // The captain has an accepted membership row too, so this is the real total.
  return rows.map((r) => ({ ...r.team, memberCount: r.team._count.members }));
}

// ---------------------------------------------------------------------------
// Tags, closing
// ---------------------------------------------------------------------------

/** Which community tag a player wears next to their name (null = none). */
export async function setFeaturedCommunity(userId: string, communityId: string | null) {
  if (communityId) {
    const member = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      include: { community: { select: { tag: true, enabled: true } } },
    });
    if (!member) throw new CommunityError("NOT_A_MEMBER", "You can only wear the tag of a community you're in.");
    if (!member.community.tag || !member.community.enabled) throw new CommunityError("INVALID", "That community doesn't have a tag.");
  }
  await prisma.user.update({ where: { id: userId }, data: { featuredCommunityId: communityId } });
}

/** Owner (or staff) closes a player community. It's disabled rather than
 *  deleted — the slug stays taken so nobody can impersonate it later. */
export async function closeCommunity(communityId: string, actor: Actor) {
  const community = await loadCommunity(communityId);
  if (community.kind !== "PLAYER") throw new CommunityError("FORBIDDEN", "This community can't be closed.");
  if (community.ownerId !== actor.id && !actor.isStaff) throw new CommunityError("FORBIDDEN", "Only the owner can close the community.");
  await prisma.$transaction([
    prisma.community.update({ where: { id: communityId }, data: { enabled: false } }),
    prisma.user.updateMany({ where: { featuredCommunityId: communityId }, data: { featuredCommunityId: null } }),
    prisma.communityInvite.updateMany({ where: { communityId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

/** Staff suspend a community (members lose access; the owner is told why
 *  and can appeal) or restore it. */
export async function suspendCommunity(communityId: string, reason: string) {
  const community = await loadCommunity(communityId);
  if (community.kind === "GLOBAL") throw new CommunityError("FORBIDDEN", "Circuit can't be suspended.");
  const why = reason.trim().slice(0, 300) || "It broke Circuit's community rules.";
  await prisma.$transaction([
    prisma.community.update({ where: { id: communityId }, data: { enabled: false, suspendedAt: new Date(), suspensionReason: why } }),
    prisma.user.updateMany({ where: { featuredCommunityId: communityId }, data: { featuredCommunityId: null } }),
  ]);
  if (community.ownerId) {
    await notify(community.ownerId, "COMMUNITY_SUSPENDED", { communityTitle: communityTitle(community), reason: why, href: communityHref(community) });
  }
}

export async function restoreCommunity(communityId: string) {
  await loadCommunity(communityId);
  await prisma.community.update({ where: { id: communityId }, data: { enabled: true, suspendedAt: null, suspensionReason: null } });
}
