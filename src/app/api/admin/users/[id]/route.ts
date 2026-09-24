/**
 * Circuit — admin user suspension (Phase 1 of the admin build-out).
 * `User.isSuspended`/`suspensionReason` already existed for exactly this
 * (P6-4/TRU-4) — this is the first real write path to them; previously
 * only a direct DB write could set either.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;
  const admin = staffAuth.user;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.isSuspended !== "boolean") {
    return NextResponse.json({ error: "isSuspended (boolean) is required." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (target.isStaff) {
    return NextResponse.json({ error: "Staff accounts can't be suspended from here." }, { status: 409 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const updated = await prisma.user.update({
    where: { id },
    data: {
      isSuspended: body.isSuspended,
      suspensionReason: body.isSuspended ? reason || null : null,
    },
  });

  await logAdminAction({
    actorId: admin.id,
    action: body.isSuspended ? "user.suspend" : "user.unsuspend",
    targetType: "User",
    targetId: id,
    metadata: { reason: updated.suspensionReason },
  });

  return NextResponse.json({ isSuspended: updated.isSuspended, suspensionReason: updated.suspensionReason });
}
