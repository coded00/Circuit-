/**
 * Circuit — the one real Announcement the player homepage shows, if any.
 * Most-recently-created enabled row wins; no scheduling/targeting (see
 * the `Announcement` model's own schema comment for why).
 */

import { prisma } from "@/lib/db";

export async function getActiveAnnouncement() {
  return prisma.announcement.findFirst({
    where: { enabled: true },
    orderBy: { createdAt: "desc" },
  });
}
