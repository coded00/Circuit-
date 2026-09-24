/**
 * Circuit Community — marks the community read for the current user
 * (Phase 1's single-timestamp "basic unread count"). Called when the
 * community view mounts/comes into focus.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { markCommunityRead } from "@/lib/community";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { id } = await params;
  await markCommunityRead(id, user.id);
  return NextResponse.json({ ok: true });
}
