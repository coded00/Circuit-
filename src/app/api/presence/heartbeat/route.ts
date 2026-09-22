/**
 * Circuit — Quick Match presence heartbeat. Refreshes `User.lastActiveAt`;
 * "online" for Quick Match eligibility means this within the last ~45-60s.
 * See that field's own schema comment for why this is scoped narrowly to
 * Quick Match rather than a general presence system.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });

  return NextResponse.json({ ok: true });
}
