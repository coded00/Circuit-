/**
 * Circuit — edit / enable / delete a named format. A formatless mode's
 * default format is managed through its mode (PATCH /api/admin/
 * game-modes/[id]), so it's rejected here.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { parseFormatInput } from "@/lib/gameCatalog";
import { readJsonObject } from "@/lib/adminRoute";

async function loadNamedFormat(id: string) {
  const format = await prisma.gameFormat.findUnique({
    where: { id },
    include: { mode: { select: { style: true, formats: { select: { id: true, name: true } } } } },
  });
  if (!format) return NextResponse.json({ error: "Format not found." }, { status: 404 });
  if (format.isDefault) return NextResponse.json({ error: "Edit this configuration from its mode." }, { status: 400 });
  return format;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;

  const { id } = await params;
  const format = await loadNamedFormat(id);
  if (format instanceof NextResponse) return format;

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;

  let data: Record<string, unknown>;
  if (typeof body.name === "string") {
    const parsed = parseFormatInput(body, format.mode.style);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (format.mode.formats.some((f) => f.id !== id && f.name.toLowerCase() === parsed.value.name.toLowerCase())) {
      return NextResponse.json({ error: `This mode already has a "${parsed.value.name}" format.` }, { status: 409 });
    }
    data = { ...parsed.value };
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  } else if (typeof body.enabled === "boolean") {
    data = { enabled: body.enabled };
  } else {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await prisma.gameFormat.update({ where: { id }, data });
  await logAdminAction({ actorId: staffAuth.user.id, action: "gameFormat.update", targetType: "GameFormat", targetId: id, metadata: { fields: Object.keys(data) } });

  return NextResponse.json({ id });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;

  const { id } = await params;
  const format = await loadNamedFormat(id);
  if (format instanceof NextResponse) return format;

  await prisma.gameFormat.delete({ where: { id } });
  await logAdminAction({ actorId: staffAuth.user.id, action: "gameFormat.delete", targetType: "GameFormat", targetId: id, metadata: { name: format.name } });

  return NextResponse.json({ ok: true });
}
