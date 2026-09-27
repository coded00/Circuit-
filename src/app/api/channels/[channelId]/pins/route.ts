/** Circuit — a channel's pinned messages (members). */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listPinned } from "@/lib/communityThreads";
import { handleCommunityError } from "@/lib/communityHttp";

export async function GET(_request: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { channelId } = await params;
  try {
    return NextResponse.json({ pins: await listPinned(channelId, user) });
  } catch (err) {
    return handleCommunityError(err);
  }
}
