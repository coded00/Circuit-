/**
 * Circuit — admin fund freeze (V1 audit's "admin control over funds"
 * requirement). Staff-only, deliberately not organizer-accessible — a
 * freeze exists to hold funds while staff investigate something (a
 * dispute gone wrong, a suspected fraud pattern), so the organizer being
 * able to lift their own freeze would defeat the point.
 *
 * Enforcement lives at the two routes that actually move this
 * tournament's money: POST /api/tournaments/[id]/payout (prize claim)
 * and POST /api/tournaments/[id]/cancel (refund fan-out) both check
 * `tournament.fundsFrozen` and refuse while it's set — see their own
 * comments.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;
  const admin = staffAuth.user;

  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }
  if (tournament.fundsFrozen) {
    return NextResponse.json({ error: "Funds for this tournament are already frozen." }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "A reason is required to freeze funds." }, { status: 400 });
  }

  await prisma.tournament.update({ where: { id }, data: { fundsFrozen: true } });
  await logAdminAction({
    actorId: admin.id,
    action: "tournament.freezeFunds",
    targetType: "Tournament",
    targetId: id,
    metadata: { name: tournament.name, reason },
  });

  return NextResponse.json({ fundsFrozen: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;
  const admin = staffAuth.user;

  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }
  if (!tournament.fundsFrozen) {
    return NextResponse.json({ error: "Funds for this tournament aren't frozen." }, { status: 409 });
  }

  await prisma.tournament.update({ where: { id }, data: { fundsFrozen: false } });
  await logAdminAction({
    actorId: admin.id,
    action: "tournament.unfreezeFunds",
    targetType: "Tournament",
    targetId: id,
    metadata: { name: tournament.name },
  });

  return NextResponse.json({ fundsFrozen: false });
}
