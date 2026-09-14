/**
 * Circuit — cancel a sent request, decline a received one, or unfriend
 * an accepted friendship. Same delete either way — see the `Friendship`
 * model's own schema comment.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (!friendship) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (friendship.requesterId !== user.id && friendship.addresseeId !== user.id) {
    return NextResponse.json({ error: "Not your friendship to remove." }, { status: 403 });
  }

  await prisma.friendship.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
