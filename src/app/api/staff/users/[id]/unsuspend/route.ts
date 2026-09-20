import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  // Mirrors the same guard on the suspend route/admin/users/[id] — a staff
  // account was never suspendable from here in the first place once the
  // sibling fix lands, but this keeps the pair symmetric and defends
  // against any future direct-DB-write path that bypasses that check.
  if (target.isStaff) {
    return NextResponse.json({ error: "Staff accounts can't be modified from here." }, { status: 409 });
  }

  await prisma.user.update({
    where: { id },
    data: { isSuspended: false, suspensionReason: null },
  });

  return NextResponse.json({ ok: true });
}
