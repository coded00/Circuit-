/**
 * Circuit — admin-created Community/Game Release calendar events. See
 * `CalendarEventCategory`'s own schema comment for why only these two
 * categories are ever admin-authored (Tournaments/Challenges stay
 * entirely derived from real Tournament/Battle rows).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

const CATEGORIES = ["COMMUNITY", "GAME_RELEASE"] as const;

export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (!admin.isStaff) return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const category = body.category;
  const date = typeof body.date === "string" ? new Date(body.date) : null;

  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Category must be COMMUNITY or GAME_RELEASE." }, { status: 400 });
  }
  if (!date || Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "A valid date is required." }, { status: 400 });
  }

  const event = await prisma.calendarEvent.create({ data: { title, category, date } });
  await logAdminAction({ actorId: admin.id, action: "calendarEvent.create", targetType: "CalendarEvent", targetId: event.id });

  return NextResponse.json({ id: event.id }, { status: 201 });
}
