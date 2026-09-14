/**
 * Circuit — admin homepage banner edit/reorder/enable/delete.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (!admin.isStaff) return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.homepageBanner.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Banner not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.headline === "string") data.headline = body.headline.trim();
  if (typeof body.imageUrl === "string") data.imageUrl = body.imageUrl.trim();
  if (body.description !== undefined) data.description = typeof body.description === "string" ? body.description.trim() || null : null;
  if (body.ctaLabel !== undefined) data.ctaLabel = typeof body.ctaLabel === "string" ? body.ctaLabel.trim() || null : null;
  if (body.ctaHref !== undefined) data.ctaHref = typeof body.ctaHref === "string" ? body.ctaHref.trim() || null : null;
  if (body.publishAt !== undefined) data.publishAt = typeof body.publishAt === "string" && body.publishAt ? new Date(body.publishAt) : null;
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.order === "number") data.order = body.order;

  const updated = await prisma.homepageBanner.update({ where: { id }, data });

  await logAdminAction({ actorId: admin.id, action: "banner.update", targetType: "HomepageBanner", targetId: id, metadata: { fields: Object.keys(data) } });

  return NextResponse.json({ id: updated.id });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (!admin.isStaff) return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.homepageBanner.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Banner not found." }, { status: 404 });

  await prisma.homepageBanner.delete({ where: { id } });
  await logAdminAction({ actorId: admin.id, action: "banner.delete", targetType: "HomepageBanner", targetId: id, metadata: { headline: existing.headline } });

  return NextResponse.json({ ok: true });
}
