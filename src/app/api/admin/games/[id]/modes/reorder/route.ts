import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { parseReorder, readJsonObject } from "@/lib/adminRoute";

/** Circuit — set a game's mode order: `{ ids: [...] }`, every mode once. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;

  const { id: gameId } = await params;
  const modes = await prisma.gameMode.findMany({ where: { gameId }, select: { id: true } });

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const ids = parseReorder(body, modes.map((m) => m.id));
  if (ids instanceof NextResponse) return ids;

  await prisma.$transaction(ids.map((id, index) => prisma.gameMode.update({ where: { id }, data: { sortOrder: index } })));
  return NextResponse.json({ ok: true });
}
