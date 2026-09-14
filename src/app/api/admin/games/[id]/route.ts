/**
 * Circuit — admin Game catalog edit/enable/delete. Deleting a `Game` row
 * doesn't touch existing `Tournament.game`/`Battle.game` strings — those
 * aren't a foreign key (see the `Game` model's schema comment) — it only
 * removes the name from future creation/edit form options.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (!admin.isStaff) return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.game.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Game not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    if (name !== existing.name) {
      const clash = await prisma.game.findUnique({ where: { name } });
      if (clash) return NextResponse.json({ error: "A game with that name already exists." }, { status: 409 });
    }
    data.name = name;
  }
  if (body.iconUrl !== undefined) data.iconUrl = typeof body.iconUrl === "string" ? body.iconUrl.trim() || null : null;
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;

  const updated = await prisma.game.update({ where: { id }, data });

  await logAdminAction({ actorId: admin.id, action: "game.update", targetType: "Game", targetId: id, metadata: { fields: Object.keys(data) } });

  return NextResponse.json({ id: updated.id });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (!admin.isStaff) return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.game.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Game not found." }, { status: 404 });

  await prisma.game.delete({ where: { id } });
  await logAdminAction({ actorId: admin.id, action: "game.delete", targetType: "Game", targetId: id, metadata: { name: existing.name } });

  return NextResponse.json({ ok: true });
}
