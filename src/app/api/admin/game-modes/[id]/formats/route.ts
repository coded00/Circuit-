/**
 * Circuit — add a format (Solo, Duo, Squad, 5v5...) to a mode. Only modes
 * with a format layer take named formats; a formatless mode's single
 * configuration is edited through the mode itself.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { parseFormatInput } from "@/lib/gameCatalog";
import { readJsonObject } from "@/lib/adminRoute";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;

  const { id: modeId } = await params;
  const mode = await prisma.gameMode.findUnique({ where: { id: modeId }, include: { formats: { select: { name: true, sortOrder: true } } } });
  if (!mode) return NextResponse.json({ error: "Mode not found." }, { status: 404 });
  if (!mode.usesFormats) {
    return NextResponse.json({ error: "Turn on formats for this mode before adding named formats." }, { status: 400 });
  }

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;

  const parsed = parseFormatInput(body, mode.style);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (mode.formats.some((f) => f.name.toLowerCase() === parsed.value.name.toLowerCase())) {
    return NextResponse.json({ error: `${mode.name} already has a "${parsed.value.name}" format.` }, { status: 409 });
  }

  const sortOrder = mode.formats.reduce((max, f) => Math.max(max, f.sortOrder + 1), 0);
  const created = await prisma.gameFormat.create({ data: { ...parsed.value, modeId, sortOrder } });

  await logAdminAction({
    actorId: staffAuth.user.id,
    action: "gameFormat.create",
    targetType: "GameFormat",
    targetId: created.id,
    metadata: { modeId, name: created.name },
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
