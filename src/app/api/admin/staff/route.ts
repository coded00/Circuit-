/**
 * Circuit — grant admin access to an existing user. SUPER_ADMIN only —
 * see `AdminRole`'s own schema comment for the two-role split. This is
 * the first real UI path to `isStaff`/`adminRole`; previously either
 * meant a direct DB write.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

const ROLES = ["SUPER_ADMIN", "MODERATOR"] as const;

export async function POST(request: Request) {
  const superAdminAuth = await requireSuperAdmin("Only a Super Admin can grant admin access.");
  if (superAdminAuth.error) return superAdminAuth.error;
  const admin = superAdminAuth.user;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
  const role = body.role;
  if (!identifier) return NextResponse.json({ error: "A handle or email is required." }, { status: 400 });
  if (!ROLES.includes(role)) return NextResponse.json({ error: "Role must be SUPER_ADMIN or MODERATOR." }, { status: 400 });

  const target = await prisma.user.findFirst({
    where: { OR: [{ handle: identifier }, { emailOrPhone: identifier }] },
  });
  if (!target) return NextResponse.json({ error: "No user found with that handle or email." }, { status: 404 });

  const updated = await prisma.user.update({ where: { id: target.id }, data: { isStaff: true, adminRole: role } });
  await logAdminAction({
    actorId: admin.id,
    action: "staff.grant",
    targetType: "User",
    targetId: target.id,
    metadata: { role },
  });

  return NextResponse.json({ id: updated.id, handle: updated.handle, adminRole: updated.adminRole });
}
