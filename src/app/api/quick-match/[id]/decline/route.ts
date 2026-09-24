/**
 * Circuit — a recipient explicitly declines a Quick Match challenge. Only
 * affects their own recipient row; the challenge stays open for everyone
 * else — unlike accept, this never touches the challenge's own status.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const declined = await prisma.quickMatchRecipient.updateMany({
    where: { challengeId: id, recipientUserId: user.id, status: "PENDING" },
    data: { status: "DECLINED", respondedAt: new Date() },
  });
  if (declined.count === 0) {
    return NextResponse.json({ error: "This challenge is no longer pending for you." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
