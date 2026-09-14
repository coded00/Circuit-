/**
 * Circuit — change an admin's role, or revoke their admin access
 * entirely. SUPER_ADMIN only.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

const ROLES = ["SUPER_ADMIN", "MODERATOR"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (admin.adminRole !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only a Super Admin can manage admin access." }, { status: 403 });
  }

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
