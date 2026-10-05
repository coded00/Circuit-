/**
 * Circuit — staff correct a player's date of birth. Players can't change it themselves once it is set (the age
 * gate depends on it), so a wrong one is fixed here, with a reason that is kept in the audit log alongside the
 * old and new values.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { parseDateOfBirth } from "@/lib/dateOfBirth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = parseDateOfBirth(body?.dateOfBirth);
  if (!parsed.ok) return NextResponse.json({ error: "Enter a valid date of birth." }, { status: 400 });
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!reason) return NextResponse.json({ error: "A reason is required (for example: the player sent proof of their real date of birth)." }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, dateOfBirth: true } });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  await prisma.user.update({ where: { id }, data: { dateOfBirth: parsed.date } });
  await logAdminAction({
    actorId: auth.user.id,
    action: "user.correctDateOfBirth",
    targetType: "User",
    targetId: id,
    metadata: { from: target.dateOfBirth?.toISOString().slice(0, 10) ?? null, to: parsed.date.toISOString().slice(0, 10), reason },
  });
  return NextResponse.json({ ok: true });
}
