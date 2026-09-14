/**
 * Circuit — the one real platform-wide toggle (maintenance mode).
 * SUPER_ADMIN only — this affects every visitor, not a single record.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

export async function PATCH(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (admin.adminRole !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only a Super Admin can change platform settings." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.maintenanceMode !== "boolean") {
    return NextResponse.json({ error: "maintenanceMode (boolean) is required." }, { status: 400 });
  }

  const updated = await prisma.platformSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", maintenanceMode: body.maintenanceMode },
    update: { maintenanceMode: body.maintenanceMode },
  });

  await logAdminAction({
    actorId: admin.id,
    action: body.maintenanceMode ? "settings.maintenanceOn" : "settings.maintenanceOff",
    targetType: "PlatformSetting",
    targetId: "singleton",
  });

  return NextResponse.json({ maintenanceMode: updated.maintenanceMode });
}
