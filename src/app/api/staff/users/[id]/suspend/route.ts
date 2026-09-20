/**
 * Circuit — account suspension (Build Plan P6-4, maps: TRU-4).
 *
 * Blocks registering, paying, or accepting Battles — checked at those
 * specific write actions (src/app/api/tournaments/[id]/registrations,
 * src/app/api/battles/[id]/accept), never at login or browsing.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (!user.isStaff) {
    return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "A suspension reason is required." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  // Same protection as admin/users/[id] (which handles ordinary-user
  // suspension) — without it, any moderator-level staff account could
  // suspend another staff member, or a Super Admin, through this route.
  if (target.isStaff) {
    return NextResponse.json({ error: "Staff accounts can't be suspended from here." }, { status: 409 });
  }

  await prisma.user.update({
    where: { id },
    data: { isSuspended: true, suspensionReason: reason },
  });

  return NextResponse.json({ ok: true });
}
