/**
 * Circuit — staff report resolution (Build Plan P6-3).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

const VALID_STATUSES = ["REVIEWED", "ACTIONED", "DISMISSED"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;
  const staff = staffAuth.user;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const status = typeof body?.status === "string" ? body.status : "";
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const updated = await prisma.report.update({ where: { id }, data: { status } });

  // V1 audit follow-up: a moderation decision on an abuse report had no
  // audit trail at all — lower stakes than a suspension/dispute ruling,
  // but still a real moderation action worth the same trail.
  await logAdminAction({
    actorId: staff.id,
    action: "report.statusChange",
    targetType: "Report",
    targetId: id,
    metadata: { status: updated.status, reportedUserId: report.reportedUserId },
  });

  return NextResponse.json({ status: updated.status });
}
