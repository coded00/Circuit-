/**
 * Circuit — staff decide what's in the feed: PATCH { status: PUBLISHED |
 * DRAFT | ARCHIVED, game? }. Publishing keeps the clip's original date
 * when it has one (so the feed stays in real chronological order).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { jsonBody } from "@/lib/communityHttp";

const STATUSES = ["PUBLISHED", "DRAFT", "ARCHIVED"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await jsonBody(request);
  const status = STATUSES.find((s) => s === body.status);
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video) return NextResponse.json({ error: "Video not found." }, { status: 404 });
  const game = body.game === undefined ? undefined : typeof body.game === "string" && body.game.trim() ? body.game.trim().slice(0, 80) : null;
  await prisma.video.update({
    where: { id },
    data: {
      ...(status ? { status, publishedAt: status === "PUBLISHED" ? (video.publishedAt ?? new Date()) : video.publishedAt } : {}),
      ...(game !== undefined ? { game } : {}),
    },
  });
  await logAdminAction({ actorId: auth.user.id, action: `video.${status?.toLowerCase() ?? "edit"}`, targetType: "Video", targetId: id });
  return NextResponse.json({ ok: true });
}
