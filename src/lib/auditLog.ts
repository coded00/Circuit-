/**
 * Circuit — admin audit log. Every real write an admin route makes calls
 * this once, after the write succeeds. Settings > Audit Log is a plain
 * read of this table — nothing else populates or reads it.
 *
 * The finance CSV exports (finding #22) are the one *read* that logs here.
 * They are the only place an admin can take a bulk copy of other people's
 * financial history out of Circuit as a file, and a bulk copy nobody can
 * account for afterwards is the whole reason the entry exists.
 */

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function logAdminAction(params: {
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLogEntry.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata,
    },
  });
}
