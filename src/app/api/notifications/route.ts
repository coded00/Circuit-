/**
 * Circuit — notification inbox read side. The write side (`notify()`,
 * src/lib/notifications.ts) has existed since Phase 0; nothing ever read
 * these back until the NEXA-reference rebuild's bell/inbox.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { formatNotification } from "@/lib/notification-format";

const DEFAULT_TAKE = 20;
const MAX_TAKE = 50;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "true";
  const cursor = searchParams.get("cursor");
  const take = Math.min(MAX_TAKE, Math.max(1, Number(searchParams.get("take")) || DEFAULT_TAKE));

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  const notifications = page.map((n) => {
    const { message, href } = formatNotification(n.type, n.payload);
    return { id: n.id, type: n.type, message, href, readAt: n.readAt, createdAt: n.createdAt };
  });

  return NextResponse.json({
    notifications,
    nextCursor: hasMore ? page[page.length - 1].id : null,
    unreadCount,
  });
}
