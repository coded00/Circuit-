/**
 * Circuit — reporting things inside communities (messages and images,
 * members, threads, whole communities).
 *
 * Routing: a report goes to that community's moderators first. It goes
 * straight to Circuit staff ("escalated") when it's about the community
 * itself, when the reason is serious (threats, hate, sexual content), or
 * when a moderator escalates it. Staff see every escalated report.
 * Reporting a user's profile uses the existing player report flow
 * (src/app/api/reports).
 */

import type { CommunityReportTarget, ReportReason } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notify, notifyStaff } from "@/lib/notifications";
import { canModerate, CommunityError, communityHref, communityTitle, deleteMessage, effectiveRole, requireModerator } from "@/lib/community";
import { muteMember, removeMember, suspendCommunity } from "@/lib/communityModeration";

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "HARASSMENT", label: "Harassment" },
  { value: "HATE", label: "Hate or abuse" },
  { value: "SPAM", label: "Spam" },
  { value: "SCAM", label: "Scam" },
  { value: "SEXUAL", label: "Sexual content" },
  { value: "CHEATING", label: "Cheating" },
  { value: "THREATS", label: "Threats" },
  { value: "IMPERSONATION", label: "Impersonation" },
  { value: "OTHER", label: "Something else" },
];

/** Reasons that skip the community's own moderators. */
export const SERIOUS_REASONS: ReportReason[] = ["THREATS", "HATE", "SEXUAL"];

const isReason = (v: unknown): v is ReportReason => REPORT_REASONS.some((r) => r.value === v);

export type ReportInput = { targetType?: unknown; messageId?: unknown; userId?: unknown; communityId?: unknown; threadId?: unknown; reason?: unknown; details?: unknown };

export async function fileCommunityReport(reporterId: string, input: ReportInput) {
  if (!isReason(input.reason)) throw new CommunityError("INVALID", "Pick a reason.");
  const details = typeof input.details === "string" ? input.details.trim().slice(0, 500) || null : null;
  const target = input.targetType as CommunityReportTarget;

  let communityId: string;
  let messageId: string | null = null;
  let messageContent: string | null = null;
  let targetUserId: string | null = null;
  let threadId: string | null = null;

  if (target === "MESSAGE") {
    const message = typeof input.messageId === "string"
      ? await prisma.message.findUnique({ where: { id: input.messageId }, select: { id: true, authorId: true, content: true, kind: true, deletedAt: true, channel: { select: { communityId: true } } } })
      : null;
    if (!message || message.deletedAt) throw new CommunityError("NOT_FOUND", "That message is gone.");
    communityId = message.channel.communityId;
    messageId = message.id;
    targetUserId = message.authorId;
    messageContent = message.kind === "IMAGE" ? `[image] ${message.content}`.trim() : message.content || `[${message.kind.toLowerCase()}]`;
  } else if (target === "THREAD") {
    const thread = typeof input.threadId === "string" ? await prisma.thread.findUnique({ where: { id: input.threadId } }) : null;
    if (!thread) throw new CommunityError("NOT_FOUND", "That thread is gone.");
    communityId = thread.communityId;
    threadId = thread.id;
    targetUserId = thread.creatorId;
    messageContent = `Thread: ${thread.title}`;
  } else if (target === "MEMBER" || target === "COMMUNITY") {
    if (typeof input.communityId !== "string") throw new CommunityError("INVALID", "Which community?");
    communityId = input.communityId;
    if (target === "MEMBER") {
      if (typeof input.userId !== "string") throw new CommunityError("INVALID", "Who are you reporting?");
      targetUserId = input.userId;
    }
  } else {
    throw new CommunityError("INVALID", "You can't report that.");
  }
  if (targetUserId === reporterId) throw new CommunityError("INVALID", "You can't report yourself.");

  const community = await prisma.community.findUnique({ where: { id: communityId }, include: { tournament: { select: { name: true, organizerId: true } } } });
  if (!community) throw new CommunityError("NOT_FOUND", "Community not found.");
  if (target !== "COMMUNITY" && !(await prisma.communityMember.count({ where: { communityId, userId: reporterId } }))) {
    throw new CommunityError("NOT_A_MEMBER", "Join the community to report things in it.");
  }
  const duplicate = await prisma.communityReport.findFirst({
    where: { reporterId, communityId, targetType: target, messageId, threadId, targetUserId, status: { in: ["OPEN", "ESCALATED"] } },
    select: { id: true },
  });
  if (duplicate) return duplicate;

  const escalate = target === "COMMUNITY" || SERIOUS_REASONS.includes(input.reason) || community.kind === "GLOBAL";
  const report = await prisma.communityReport.create({
    data: {
      communityId,
      targetType: target,
      messageId,
      messageContent,
      threadId,
      targetUserId,
      reporterId,
      reason: input.reason,
      details,
      status: escalate ? "ESCALATED" : "OPEN",
      escalatedAt: escalate ? new Date() : null,
    },
  });

  const payload = { communityTitle: communityTitle(community), href: `${communityHref(community)}/settings?tab=reports` };
  if (escalate) {
    await notifyStaff("REPORT_FILED", { reportId: report.id });
  } else {
    const mods = await prisma.communityMember.findMany({ where: { communityId, role: { in: ["OWNER", "MODERATOR"] } }, select: { userId: true } });
    const ids = new Set([...mods.map((m) => m.userId), ...(community.ownerId ? [community.ownerId] : []), ...(community.tournament ? [community.tournament.organizerId] : [])]);
    ids.delete(targetUserId ?? "");
    await Promise.all([...ids].map((id) => notify(id, "COMMUNITY_REPORT", payload)));
  }
  return report;
}

const REPORT_INCLUDE = {
  reporter: { select: { handle: true, displayName: true } },
  targetUser: { select: { id: true, handle: true, displayName: true, isSuspended: true } },
  message: { select: { id: true, deletedAt: true, channel: { select: { name: true } } } },
  community: { select: { id: true, name: true, slug: true, kind: true, tournamentId: true, enabled: true, suspendedAt: true } },
} as const;

/** A community's queue (moderators): open ones, plus ones already with staff. */
export async function listCommunityReports(communityId: string) {
  return prisma.communityReport.findMany({
    where: { communityId, status: { in: ["OPEN", "ESCALATED"] } },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: REPORT_INCLUDE,
  });
}

/** Circuit staff's queue. */
export async function listEscalatedReports() {
  return prisma.communityReport.findMany({ where: { status: "ESCALATED" }, orderBy: { createdAt: "asc" }, take: 100, include: REPORT_INCLUDE });
}

export type ReportAction = "dismiss" | "remove_message" | "mute_1h" | "mute_24h" | "mute_7d" | "ban" | "escalate" | "suspend_community";

/**
 * Resolves a report. Moderators can act on their community's OPEN
 * reports; staff can act on any report, and only staff can suspend a
 * community. Actions on the reported member respect the usual rank rules.
 */
export async function resolveReport(reportId: string, actor: { id: string; isStaff: boolean }, action: ReportAction, note?: string) {
  const report = await prisma.communityReport.findUnique({ where: { id: reportId } });
  if (!report || report.status === "ACTIONED" || report.status === "DISMISSED") throw new CommunityError("NOT_FOUND", "That report was already handled.");
  if (!actor.isStaff) {
    if (report.status !== "OPEN") throw new CommunityError("FORBIDDEN", "Circuit staff are handling this one.");
    await requireModerator(report.communityId, actor);
  }

  const who = report.targetUserId;
  switch (action) {
    case "escalate":
      if (report.status === "ESCALATED") return;
      await prisma.communityReport.update({ where: { id: reportId }, data: { status: "ESCALATED", escalatedAt: new Date() } });
      await notifyStaff("REPORT_FILED", { reportId });
      return;
    case "remove_message":
      if (!report.messageId) throw new CommunityError("INVALID", "This report isn't about a message.");
      await deleteMessage(report.messageId, actor).catch((err) => {
        if (!(err instanceof CommunityError && err.code === "NOT_FOUND")) throw err;
      });
      break;
    case "mute_1h":
    case "mute_24h":
    case "mute_7d":
      if (!who) throw new CommunityError("INVALID", "Nobody to mute.");
      await muteMember(report.communityId, actor, who, { mute_1h: 1, mute_24h: 24, mute_7d: 168 }[action], `Report: ${report.reason.toLowerCase()}`);
      break;
    case "ban":
      if (!who) throw new CommunityError("INVALID", "Nobody to ban.");
      await removeMember(report.communityId, actor, who, { ban: true, reason: `Report: ${report.reason.toLowerCase()}` });
      break;
    case "suspend_community":
      if (!actor.isStaff) throw new CommunityError("FORBIDDEN", "Only Circuit staff can suspend a community.");
      await suspendCommunity(report.communityId, note ?? `Reported for ${report.reason.toLowerCase()}.`);
      break;
    case "dismiss":
      break;
    default:
      throw new CommunityError("INVALID", "Unknown action.");
  }

  await prisma.communityReport.update({
    where: { id: reportId },
    data: { status: action === "dismiss" ? "DISMISSED" : "ACTIONED", handledById: actor.id, handledAt: new Date(), resolution: note?.slice(0, 300) ?? action },
  });
}

/** For the settings page badge: does this viewer moderate here? */
export async function canSeeReports(communityId: string, user: { id: string; isStaff: boolean }) {
  const community = await prisma.community.findUnique({ where: { id: communityId }, include: { tournament: { select: { organizerId: true } } } });
  return !!community && canModerate(await effectiveRole(community, user));
}
