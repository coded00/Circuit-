import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { parseReorder, readJsonObject } from "@/lib/adminRoute";

/** Circuit — set a mode's format order: `{ ids: [...] }`, every format once. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;

  const { id: modeId } = await params;
  const formats = await prisma.gameFormat.findMany({ where: { modeId }, select: { id: true } });

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const ids = parseReorder(body, formats.map((f) => f.id));
  if (ids instanceof NextResponse) return ids;

  await prisma.$transaction(ids.map((id, index) => prisma.gameFormat.update({ where: { id }, data: { sortOrder: index } })));
  return NextResponse.json({ ok: true });
}
