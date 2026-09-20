/**
 * Circuit — staff report resolution (Build Plan P6-3).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";

const VALID_STATUSES = ["REVIEWED", "ACTIONED", "DISMISSED"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const status = typeof body?.status === "string" ? body.status : "";
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const updated = await prisma.report.update({ where: { id }, data: { status } });
  return NextResponse.json({ status: updated.status });
}
