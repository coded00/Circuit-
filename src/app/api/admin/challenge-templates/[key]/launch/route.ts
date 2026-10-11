/** Circuit — launch today's challenge from a template right now, without waiting for the rotation. Super Admin only. */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { launchTemplate } from "@/lib/challengeTemplateAdmin";
import { logAdminAction } from "@/lib/auditLog";

export async function POST(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const auth = await requireSuperAdmin("Only a Super Admin can launch a challenge template.");
  if (auth.error) return auth.error;
  const { key } = await params;

  const result = await launchTemplate({ key, actorId: auth.user.id });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await prisma.challengeTemplateState.upsert({
    where: { templateKey: key },
    create: { templateKey: key, launchedOn: result.dateKey, lastResult: `Launched for ${result.dateKey} (by hand).`, updatedById: auth.user.id },
    update: { launchedOn: result.dateKey, lastResult: `Launched for ${result.dateKey} (by hand).` },
  });
  await logAdminAction({ actorId: auth.user.id, action: "challengeTemplate.launch", targetType: "DailyChallenge", targetId: result.challengeId, metadata: { templateKey: key, day: result.dateKey, byHand: true } });
  return NextResponse.json({ ok: true, challengeId: result.challengeId });
}
