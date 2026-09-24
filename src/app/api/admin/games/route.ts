/**
 * Circuit — admin Game catalog creation. Real rows here are what the
 * tournament/battle creation and edit forms offer as game options (see
 * the `Game` model's own schema comment).
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
