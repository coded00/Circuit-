/**
 * Circuit — change an admin's role, or revoke their admin access
 * entirely. SUPER_ADMIN only.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

const ROLES = ["SUPER_ADMIN", "MODERATOR"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const superAdminAuth = await requireSuperAdmin("Only a Super Admin can manage admin access.");
  if (superAdminAuth.error) return superAdminAuth.error;
  const admin = superAdminAuth.user;

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (id === admin.id) {
    return NextResponse.json({ error: "You can't change your own admin access." }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // The self-modification check above already guarantees the acting
  // SUPER_ADMIN can never remove their own access, so the count can never
  // reach zero through this route — but it could reach exactly one (just
  // the actor), a single point of failure if that one account is ever
  // lost or locked out. Requiring at least two is a business-continuity
  // floor, not a security fix for an otherwise-reachable bug.
  const removesLastOtherSuperAdmin =
    target.adminRole === "SUPER_ADMIN" &&
    (body.revoke === true || body.role === "MODERATOR") &&
    (await prisma.user.count({ where: { adminRole: "SUPER_ADMIN", id: { not: id } } })) === 0;
  if (removesLastOtherSuperAdmin) {
    return NextResponse.json(
      { error: "This is the only other Super Admin — promote someone else first." },
      { status: 409 }
    );
  }

  if (body.revoke === true) {
    const updated = await prisma.user.update({ where: { id }, data: { isStaff: false, adminRole: null } });
    await logAdminAction({ actorId: admin.id, action: "staff.revoke", targetType: "User", targetId: id });
    return NextResponse.json({ isStaff: updated.isStaff });
  }

  if (!ROLES.includes(body.role)) {
    return NextResponse.json({ error: "Role must be SUPER_ADMIN or MODERATOR." }, { status: 400 });
  }
  const updated = await prisma.user.update({ where: { id }, data: { adminRole: body.role } });
  await logAdminAction({ actorId: admin.id, action: "staff.roleChange", targetType: "User", targetId: id, metadata: { role: body.role } });
  return NextResponse.json({ adminRole: updated.adminRole });
}
