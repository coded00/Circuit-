/**
 * Circuit — send a friend request. See the `Friendship` model's own
 * schema comment for the one-row lifecycle this builds on.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { notify } from "@/lib/notifications";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const handle = typeof body?.handle === "string" ? body.handle.trim() : "";
  if (!handle) {
    return NextResponse.json({ error: "A player handle is required." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { handle } });
  if (!target) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }
  if (target.id === user.id) {
    return NextResponse.json({ error: "You can't friend yourself." }, { status: 400 });
  }

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: user.id, addresseeId: target.id },
        { requesterId: target.id, addresseeId: user.id },
      ],
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: existing.accepted ? "You're already friends." : "A request already exists between you two." },
      { status: 409 }
    );
  }

  const friendship = await prisma.friendship.create({
    data: { requesterId: user.id, addresseeId: target.id },
  });

  await notify(target.id, "FRIEND_REQUEST", { fromHandle: user.handle });

  return NextResponse.json({ id: friendship.id }, { status: 201 });
}
