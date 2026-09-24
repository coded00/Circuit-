/**
 * Circuit — admin announcement creation. Real content the homepage
 * reads back via `getActiveAnnouncement` (src/lib/announcements.ts).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

export async function POST(request: Request) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;
  const admin = staffAuth.user;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const bodyText = typeof body.body === "string" ? body.body.trim() : "";
  if (!title || !bodyText) {
    return NextResponse.json({ error: "Title and body are required." }, { status: 400 });
  }

  const announcement = await prisma.announcement.create({ data: { title, body: bodyText } });
  await logAdminAction({ actorId: admin.id, action: "announcement.create", targetType: "Announcement", targetId: announcement.id });

  return NextResponse.json({ id: announcement.id }, { status: 201 });
}
