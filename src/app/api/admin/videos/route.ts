/** Circuit — staff publish every draft clip at once: POST { action: "publish_all_drafts" }. */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { jsonBody } from "@/lib/communityHttp";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const body = await jsonBody(request);
  if (body.action !== "publish_all_drafts") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const { count } = await prisma.video.updateMany({ where: { status: "DRAFT" }, data: { status: "PUBLISHED" } });
  // Clips imported without a date get one now.
  await prisma.video.updateMany({ where: { status: "PUBLISHED", publishedAt: null }, data: { publishedAt: new Date() } });
  await logAdminAction({ actorId: auth.user.id, action: "videos.publish_all", metadata: { count } });
  return NextResponse.json({ published: count });
}
