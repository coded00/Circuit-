/**
 * Circuit — accept a received friend request.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { notify } from "@/lib/notifications";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (!friendship) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (friendship.addresseeId !== user.id) {
    return NextResponse.json({ error: "Only the recipient can accept this request." }, { status: 403 });
  }
  if (friendship.accepted) {
    return NextResponse.json({ error: "Already accepted." }, { status: 409 });
  }

  await prisma.friendship.update({ where: { id }, data: { accepted: true } });
  await notify(friendship.requesterId, "FRIEND_ACCEPTED", { byHandle: user.handle });

  return NextResponse.json({ ok: true });
}
