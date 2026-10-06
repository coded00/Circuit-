/**
 * Circuit — admin Game catalog edit / enable / publish / delete.
 * Tournament.game and Battle.game are plain strings, so deleting a game
 * never breaks anything already created — it only leaves the forms.
 * Modes and formats cascade with it.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { parseGameInput, publishBlocker } from "@/lib/gameCatalog";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;
  const admin = staffAuth.user;

  const { id } = await params;
  const existing = await prisma.game.findUnique({
    where: { id },
    include: { modes: { include: { formats: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Game not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  // Full info edit — any info field present means the whole info block is sent.
  if (typeof body.name === "string") {
    const parsed = parseGameInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (parsed.value.name !== existing.name) {
      const clash = await prisma.game.findUnique({ where: { name: parsed.value.name } });
      if (clash) return NextResponse.json({ error: "A game with that name already exists." }, { status: 409 });
    }
    if (parsed.value.slug) {
      const slugClash = await prisma.game.findFirst({ where: { slug: parsed.value.slug, NOT: { id } } });
      if (slugClash) return NextResponse.json({ error: "Another game already uses that page address." }, { status: 409 });
    }
    Object.assign(data, parsed.value);
  }
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.published === "boolean") {
    if (body.published) {
      const blocker = publishBlocker(existing.modes);
      if (blocker) return NextResponse.json({ error: blocker }, { status: 400 });
      data.publishedAt = existing.publishedAt ?? new Date();
    } else {
      data.publishedAt = null;
    }
  }

  const updated = await prisma.game.update({ where: { id }, data });

  await logAdminAction({ actorId: admin.id, action: "game.update", targetType: "Game", targetId: id, metadata: { fields: Object.keys(data) } });

  return NextResponse.json({ id: updated.id });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;
  const admin = staffAuth.user;

  const { id } = await params;
  const existing = await prisma.game.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Game not found." }, { status: 404 });

  await prisma.game.delete({ where: { id } });
  await logAdminAction({ actorId: admin.id, action: "game.delete", targetType: "Game", targetId: id, metadata: { name: existing.name } });

  return NextResponse.json({ ok: true });
}
