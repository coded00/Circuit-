/**
 * Circuit Community — `?q=` search over the people you can @mention here
 * (members who aren't suspended). Feeds the composer's suggestion list;
 * the server re-checks every mention on send regardless.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { searchMentionableMembers, CommunityError } from "@/lib/community";
import { communityErrorResponse } from "@/lib/communityHttp";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { id } = await params;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ users: await searchMentionableMembers(id, user.id, q) });
  } catch (err) {
    if (err instanceof CommunityError) return communityErrorResponse(err);
    throw err;
  }
}
