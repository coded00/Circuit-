/**
 * Circuit — admin announcement enable/disable/delete.
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
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Announcement not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) is required." }, { status: 400 });
  }

  const updated = await prisma.announcement.update({ where: { id }, data: { enabled: body.enabled } });
  await logAdminAction({
    actorId: admin.id,
    action: body.enabled ? "announcement.enable" : "announcement.disable",
    targetType: "Announcement",
    targetId: id,
  });

  return NextResponse.json({ enabled: updated.enabled });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;
  const admin = staffAuth.user;

  const { id } = await params;
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Announcement not found." }, { status: 404 });

  await prisma.announcement.delete({ where: { id } });
  await logAdminAction({ actorId: admin.id, action: "announcement.delete", targetType: "Announcement", targetId: id, metadata: { title: existing.title } });

  return NextResponse.json({ ok: true });
}
