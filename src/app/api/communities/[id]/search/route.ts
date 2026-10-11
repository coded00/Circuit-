/** Circuit — search a community's messages (members): GET ?q=. */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { searchCommunityMessages } from "@/lib/communityThreads";
import { handleCommunityError } from "@/lib/communityHttp";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { id } = await params;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ results: await searchCommunityMessages(id, user, q) });
  } catch (err) {
    return handleCommunityError(err);
  }
}
