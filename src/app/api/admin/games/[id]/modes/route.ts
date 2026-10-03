/**
 * Circuit — add a mode to a game. A mode with `usesFormats: false` has no
 * separate format layer, so its player/team rules arrive in `format` and
 * become its single default GameFormat (see the GameMode schema comment).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { parseFormatInput, parseModeInput } from "@/lib/gameCatalog";
import { readJsonObject } from "@/lib/adminRoute";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;

  const { id: gameId } = await params;
  const game = await prisma.game.findUnique({ where: { id: gameId }, include: { modes: { select: { name: true, sortOrder: true } } } });
  if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;

  const mode = parseModeInput(body);
  if (!mode.ok) return NextResponse.json({ error: mode.error }, { status: 400 });
  if (game.modes.some((m) => m.name.toLowerCase() === mode.value.name.toLowerCase())) {
    return NextResponse.json({ error: `${game.name} already has a "${mode.value.name}" mode.` }, { status: 409 });
  }

  let defaultFormat = null;
  if (!mode.value.usesFormats) {
    const formatBody = body.format && typeof body.format === "object" ? (body.format as Record<string, unknown>) : {};
    const parsed = parseFormatInput({ ...formatBody, name: mode.value.name }, mode.value.style);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    defaultFormat = parsed.value;
  }

  const sortOrder = game.modes.reduce((max, m) => Math.max(max, m.sortOrder + 1), 0);
  const created = await prisma.gameMode.create({
    data: {
      ...mode.value,
      gameId,
      sortOrder,
      ...(defaultFormat ? { formats: { create: { ...defaultFormat, isDefault: true } } } : {}),
    },
  });

  await logAdminAction({
    actorId: staffAuth.user.id,
    action: "gameMode.create",
    targetType: "GameMode",
    targetId: created.id,
    metadata: { gameId, name: created.name },
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
