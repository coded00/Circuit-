/**
 * Circuit — admin Game catalog creation. Real rows here are what the
 * tournament/battle creation and edit forms offer as game options (see
 * the `Game` model's own schema comment).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (!admin.isStaff) return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const existing = await prisma.game.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "A game with that name already exists." }, { status: 409 });
  }

  const game = await prisma.game.create({
    data: {
      name,
      iconUrl: typeof body.iconUrl === "string" ? body.iconUrl.trim() || null : null,
    },
  });

  await logAdminAction({ actorId: admin.id, action: "game.create", targetType: "Game", targetId: game.id, metadata: { name } });

  return NextResponse.json({ id: game.id }, { status: 201 });
}
