/**
 * Circuit — cancel/delete an admin-created calendar event.
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
  const existing = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.cancelled !== "boolean") {
    return NextResponse.json({ error: "cancelled (boolean) is required." }, { status: 400 });
  }

  const updated = await prisma.calendarEvent.update({ where: { id }, data: { cancelled: body.cancelled } });
  await logAdminAction({
    actorId: admin.id,
    action: body.cancelled ? "calendarEvent.cancel" : "calendarEvent.uncancel",
    targetType: "CalendarEvent",
    targetId: id,
  });

  return NextResponse.json({ cancelled: updated.cancelled });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;
  const admin = staffAuth.user;

  const { id } = await params;
  const existing = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  await prisma.calendarEvent.delete({ where: { id } });
  await logAdminAction({ actorId: admin.id, action: "calendarEvent.delete", targetType: "CalendarEvent", targetId: id, metadata: { title: existing.title } });

  return NextResponse.json({ ok: true });
}
