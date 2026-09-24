/**
 * Circuit — platform-wide settings (maintenance mode, the platform fee
 * rate, the organizer-revenue settlement window). SUPER_ADMIN only — all
 * three affect every visitor/transaction, not a single record. Any subset
 * of fields may be sent together; at least one is required.
 */

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

export async function PATCH(request: Request) {
  const superAdminAuth = await requireSuperAdmin("Only a Super Admin can change platform settings.");
  if (superAdminAuth.error) return superAdminAuth.error;
  const admin = superAdminAuth.user;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const data: { maintenanceMode?: boolean; platformFeeBps?: number; organizerRevenueSettlementHours?: number } = {};
  const actions: { action: string; metadata?: Prisma.InputJsonValue }[] = [];

  if (body.maintenanceMode !== undefined) {
    if (typeof body.maintenanceMode !== "boolean") {
      return NextResponse.json({ error: "maintenanceMode must be a boolean." }, { status: 400 });
    }
    data.maintenanceMode = body.maintenanceMode;
    actions.push({ action: body.maintenanceMode ? "settings.maintenanceOn" : "settings.maintenanceOff" });
  }

  if (body.platformFeeBps !== undefined) {
    const bps = Number(body.platformFeeBps);
    // 10000 bps = 100% — a real ceiling, not an arbitrary one: this rate
    // is carved out of what a player already paid (see PLATFORM_FEE's own
    // schema comment), so anything above 100% would be nonsensical.
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
      return NextResponse.json({ error: "Platform fee must be a whole number of basis points between 0 and 10000 (0-100%)." }, { status: 400 });
    }
    data.platformFeeBps = bps;
    actions.push({ action: "settings.platformFeeChange", metadata: { platformFeeBps: bps } });
  }

  if (body.organizerRevenueSettlementHours !== undefined) {
    const hours = Number(body.organizerRevenueSettlementHours);
    // Read fresh at sweep time, not snapshotted per tournament (see
    // PlatformSetting.organizerRevenueSettlementHours's own schema
    // comment) — a change here shifts every still-PENDING tournament's
    // settle point, not just new ones. 720h (30 days) is a real ceiling
    // against fat-fingering a value that'd hold organizer revenue
    // hostage indefinitely, not an arbitrary one.
    if (!Number.isInteger(hours) || hours < 0 || hours > 720) {
      return NextResponse.json(
        { error: "Settlement window must be a whole number of hours between 0 and 720 (30 days)." },
        { status: 400 }
      );
    }
    data.organizerRevenueSettlementHours = hours;
    actions.push({ action: "settings.organizerRevenueSettlementHoursChange", metadata: { organizerRevenueSettlementHours: hours } });
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.platformSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  for (const { action, metadata } of actions) {
    await logAdminAction({ actorId: admin.id, action, targetType: "PlatformSetting", targetId: "singleton", metadata });
  }

  return NextResponse.json({
    maintenanceMode: updated.maintenanceMode,
    platformFeeBps: updated.platformFeeBps,
    organizerRevenueSettlementHours: updated.organizerRevenueSettlementHours,
  });
}
