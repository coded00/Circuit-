/**
 * Circuit — appeals: asking staff to reverse the suspension of your
 * account or of a community you own. One open appeal per subject; staff
 * overturn it (restores access) or uphold it, with a response the person
 * is notified about.
 */

import type { AppealKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notify, notifyStaff } from "@/lib/notifications";
import { CommunityError, communityHref, communityTitle } from "@/lib/community";
import { restoreCommunity } from "@/lib/communityModeration";

export const APPEAL_MAX = 1000;

export async function fileAppeal(user: { id: string; isSuspended: boolean }, input: { kind?: unknown; communityId?: unknown; message?: unknown }) {
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (message.length < 10) throw new CommunityError("INVALID", "Tell us a bit more (at least 10 characters).");
  if (message.length > APPEAL_MAX) throw new CommunityError("INVALID", `Keep it under ${APPEAL_MAX} characters.`);

  let kind: AppealKind;
  let communityId: string | null = null;
  if (input.kind === "ACCOUNT_SUSPENSION") {
    if (!user.isSuspended) throw new CommunityError("INVALID", "Your account isn't suspended.");
    kind = "ACCOUNT_SUSPENSION";
  } else if (input.kind === "COMMUNITY_SUSPENSION" && typeof input.communityId === "string") {
    const community = await prisma.community.findUnique({ where: { id: input.communityId } });
    if (!community?.suspendedAt) throw new CommunityError("INVALID", "That community isn't suspended.");
    if (community.ownerId !== user.id) throw new CommunityError("FORBIDDEN", "Only the owner can appeal.");
    kind = "COMMUNITY_SUSPENSION";
    communityId = community.id;
  } else {
    throw new CommunityError("INVALID", "What are you appealing?");
  }

  const open = await prisma.appeal.findFirst({ where: { userId: user.id, kind, communityId, status: "OPEN" } });
  if (open) throw new CommunityError("TAKEN", "Your appeal is already with our team.");
  const appeal = await prisma.appeal.create({ data: { kind, userId: user.id, communityId, message } });
  await notifyStaff("APPEAL_FILED", { appealId: appeal.id });
  return appeal;
}

export async function listOpenAppeals() {
  return prisma.appeal.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, handle: true, displayName: true, isSuspended: true, suspensionReason: true } },
      community: { select: { id: true, name: true, slug: true, kind: true, tournamentId: true, suspensionReason: true } },
    },
  });
}

export async function decideAppeal(appealId: string, staff: { id: string }, overturn: boolean, response: string) {
  const appeal = await prisma.appeal.findUnique({ where: { id: appealId }, include: { community: true } });
  if (!appeal || appeal.status !== "OPEN") throw new CommunityError("NOT_FOUND", "That appeal was already decided.");
  if (overturn) {
    if (appeal.kind === "ACCOUNT_SUSPENSION") {
      await prisma.user.update({ where: { id: appeal.userId }, data: { isSuspended: false, suspensionReason: null } });
    } else if (appeal.communityId) {
      await restoreCommunity(appeal.communityId);
    }
  }
  await prisma.appeal.update({
    where: { id: appealId },
    data: { status: overturn ? "OVERTURNED" : "UPHELD", response: response.trim().slice(0, 500) || null, handledById: staff.id, handledAt: new Date() },
  });
  await notify(appeal.userId, "APPEAL_DECIDED", {
    overturned: overturn,
    subject: appeal.kind === "ACCOUNT_SUSPENSION" ? "your account" : communityTitle(appeal.community ?? { name: null }),
    response: response.trim().slice(0, 200),
    href: appeal.community ? communityHref(appeal.community) : "/account",
  });
}
