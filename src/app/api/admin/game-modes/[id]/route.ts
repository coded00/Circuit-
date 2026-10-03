/**
 * Circuit — edit / enable / delete a game mode.
 *
 * Two shape changes are handled here rather than left to the client:
 * - turning the format layer off (`usesFormats: false`) is only allowed
 *   with at most one format, which becomes the mode's default format (or
 *   one is created from `format` if there are none);
 * - turning it back on keeps that default format as the first named one.
 * Changing how a mode is contested (`style`) would invalidate its
 * formats' lobby/structure settings, so it's only allowed while the mode
 * has no named formats — a formatless mode re-validates its single
 * format against the new style in the same request.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { parseFormatInput, parseModeInput } from "@/lib/gameCatalog";
import { readJsonObject } from "@/lib/adminRoute";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;

  const { id } = await params;
  const existing = await prisma.gameMode.findUnique({
    where: { id },
    include: { formats: true, game: { select: { modes: { select: { id: true, name: true } } } } },
  });
  if (!existing) return NextResponse.json({ error: "Mode not found." }, { status: 404 });

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;

  // Enable/disable only.
  if (typeof body.name !== "string") {
    if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    await prisma.gameMode.update({ where: { id }, data: { enabled: body.enabled } });
    await logAdminAction({ actorId: staffAuth.user.id, action: "gameMode.update", targetType: "GameMode", targetId: id, metadata: { enabled: body.enabled } });
    return NextResponse.json({ id });
  }

  const parsed = parseModeInput({ style: existing.style, usesFormats: existing.usesFormats, ...body });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const next = parsed.value;

  if (existing.game.modes.some((m) => m.id !== id && m.name.toLowerCase() === next.name.toLowerCase())) {
    return NextResponse.json({ error: `This game already has a "${next.name}" mode.` }, { status: 409 });
  }

  const namedFormats = existing.formats.filter((f) => !f.isDefault);
  const defaultFormat = existing.formats.find((f) => f.isDefault) ?? null;

  if (next.style !== existing.style && next.usesFormats && existing.formats.length > 0) {
    return NextResponse.json({ error: "Remove this mode's formats before changing how it's contested." }, { status: 400 });
  }
  if (!next.usesFormats && namedFormats.length > 1) {
    return NextResponse.json({ error: "A mode without formats can only keep one configuration. Delete the extra formats first." }, { status: 400 });
  }

  // The single configuration of a formatless mode, re-validated against
  // the (possibly new) style. Sent as `format`; falls back to the format
  // being folded in when the admin only flipped the toggle.
  let singleFormat = null;
  if (!next.usesFormats) {
    const source = body.format && typeof body.format === "object" ? (body.format as Record<string, unknown>) : (defaultFormat ?? namedFormats[0]);
    if (!source) return NextResponse.json({ error: "Set this mode's player and team rules." }, { status: 400 });
    const result = parseFormatInput({ ...source, name: next.name }, next.style);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    singleFormat = result.value;
  }

  await prisma.$transaction(async (tx) => {
    await tx.gameMode.update({
      where: { id },
      data: { ...next, ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}) },
    });
    if (singleFormat) {
      const target = defaultFormat ?? namedFormats[0];
      if (target) {
        await tx.gameFormat.update({ where: { id: target.id }, data: { ...singleFormat, isDefault: true, enabled: true } });
      } else {
        await tx.gameFormat.create({ data: { ...singleFormat, modeId: id, isDefault: true } });
      }
    } else if (defaultFormat) {
      // Format layer turned back on: the old single configuration stays as the first named format.
      await tx.gameFormat.update({ where: { id: defaultFormat.id }, data: { isDefault: false } });
    }
  });

  await logAdminAction({ actorId: staffAuth.user.id, action: "gameMode.update", targetType: "GameMode", targetId: id, metadata: { name: next.name } });

  return NextResponse.json({ id });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;

  const { id } = await params;
  const existing = await prisma.gameMode.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Mode not found." }, { status: 404 });

  await prisma.gameMode.delete({ where: { id } });
  await logAdminAction({ actorId: staffAuth.user.id, action: "gameMode.delete", targetType: "GameMode", targetId: id, metadata: { name: existing.name } });

  return NextResponse.json({ ok: true });
}
